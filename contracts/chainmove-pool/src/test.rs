extern crate std;

use super::{ChainMovePoolContract, ChainMovePoolContractClient, ContractError};
use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

const POOL_ID: u64 = 1;
const TARGET: i128 = 10_000;
const UNITS: u64 = 100;

struct Fixture {
    env: Env,
    contract_id: Address,
    owner: Address,
    repayer: Address,
    investor: Address,
    asset: Address,
}

fn create_fixture() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ChainMovePoolContract, ());
    let owner = Address::generate(&env);
    let repayer = Address::generate(&env);
    let investor = Address::generate(&env);
    let asset_admin = Address::generate(&env);
    let asset = env
        .register_stellar_asset_contract_v2(asset_admin)
        .address();

    let stellar_asset = token::StellarAssetClient::new(&env, &asset);
    stellar_asset.mint(&investor, &TARGET);
    stellar_asset.mint(&repayer, &TARGET);

    ChainMovePoolContractClient::new(&env, &contract_id)
        .try_create_pool(
            &owner,
            &repayer,
            &POOL_ID,
            &asset,
            &String::from_str(&env, "testnet-van-01"),
            &UNITS,
            &TARGET,
        )
        .unwrap()
        .unwrap();

    Fixture {
        env,
        contract_id,
        owner,
        repayer,
        investor,
        asset,
    }
}

fn pool_client(fixture: &Fixture) -> ChainMovePoolContractClient<'_> {
    ChainMovePoolContractClient::new(&fixture.env, &fixture.contract_id)
}

fn token_client<'a>(env: &'a Env, asset: &'a Address) -> token::TokenClient<'a> {
    token::TokenClient::new(env, asset)
}

fn approve(fixture: &Fixture, holder: &Address, amount: i128) {
    token_client(&fixture.env, &fixture.asset).approve(
        holder,
        &fixture.contract_id,
        &amount,
        &10_000,
    );
}

fn fund(fixture: &Fixture, investor: &Address, amount: i128, reference: &str) {
    approve(fixture, investor, amount);
    pool_client(fixture)
        .try_fund_pool(
            investor,
            &POOL_ID,
            &fixture.asset,
            &amount,
            &String::from_str(&fixture.env, reference),
        )
        .unwrap()
        .unwrap();
}

#[test]
fn creates_pool_bound_to_asset_and_reads_pool_data() {
    let fixture = create_fixture();

    let pool = pool_client(&fixture)
        .try_read_pool(&POOL_ID)
        .unwrap()
        .unwrap();

    assert_eq!(pool.id, POOL_ID);
    assert_eq!(pool.owner, fixture.owner);
    assert_eq!(pool.repayer, fixture.repayer);
    assert_eq!(pool.asset, fixture.asset);
    assert_eq!(pool.total_units, UNITS);
    assert_eq!(pool.funded_units, 0);
    assert_eq!(pool.target_amount, TARGET);
    assert_eq!(pool.total_invested, 0);
    assert_eq!(pool.total_repaid, 0);
    assert!(pool.active);
}

#[test]
fn funding_transfers_tokens_into_contract_custody() {
    let fixture = create_fixture();
    let token = token_client(&fixture.env, &fixture.asset);

    fund(&fixture, &fixture.investor, 2_500, "fund-1");

    let pool = pool_client(&fixture)
        .try_read_pool(&POOL_ID)
        .unwrap()
        .unwrap();
    let position = pool_client(&fixture)
        .try_read_investor_position(&fixture.investor, &POOL_ID)
        .unwrap()
        .unwrap();

    assert_eq!(position.invested, 2_500);
    assert_eq!(position.units, 25);
    assert_eq!(pool.total_invested, 2_500);
    assert_eq!(pool.funded_units, 25);
    assert_eq!(token.balance(&fixture.contract_id), 2_500);
    assert_eq!(token.balance(&fixture.investor), 7_500);
}

#[test]
fn full_lifecycle_funds_closes_and_records_repayment() {
    let fixture = create_fixture();
    let token = token_client(&fixture.env, &fixture.asset);

    fund(&fixture, &fixture.investor, 4_000, "fund-1");
    pool_client(&fixture)
        .try_close_pool(&fixture.owner, &POOL_ID)
        .unwrap()
        .unwrap();
    approve(&fixture, &fixture.repayer, 1_500);

    let position = pool_client(&fixture)
        .try_record_repayment(
            &fixture.repayer,
            &POOL_ID,
            &fixture.investor,
            &fixture.asset,
            &1_500,
            &String::from_str(&fixture.env, "repay-1"),
        )
        .unwrap()
        .unwrap();
    let pool = pool_client(&fixture)
        .try_read_pool(&POOL_ID)
        .unwrap()
        .unwrap();

    assert!(!pool.active);
    assert_eq!(pool.total_repaid, 1_500);
    assert_eq!(position.repaid, 1_500);
    assert_eq!(token.balance(&fixture.contract_id), 4_000);
    assert_eq!(token.balance(&fixture.investor), 7_500);
    assert_eq!(token.balance(&fixture.repayer), 8_500);
}

#[test]
fn failed_transfer_leaves_no_state_changes() {
    let fixture = create_fixture();
    let token = token_client(&fixture.env, &fixture.asset);

    let result = pool_client(&fixture).try_fund_pool(
        &fixture.investor,
        &POOL_ID,
        &fixture.asset,
        &1_000,
        &String::from_str(&fixture.env, "fund-no-allowance"),
    );

    assert_eq!(
        result.unwrap_err().unwrap(),
        ContractError::InsufficientAllowance
    );

    let pool = pool_client(&fixture)
        .try_read_pool(&POOL_ID)
        .unwrap()
        .unwrap();
    assert_eq!(pool.total_invested, 0);
    assert_eq!(pool.funded_units, 0);
    assert_eq!(token.balance(&fixture.contract_id), 0);
    assert!(pool_client(&fixture)
        .try_read_investor_position(&fixture.investor, &POOL_ID)
        .is_err());
}

#[test]
fn rejects_wrong_asset_before_transfer() {
    let fixture = create_fixture();
    let wrong_admin = Address::generate(&fixture.env);
    let wrong_asset = fixture
        .env
        .register_stellar_asset_contract_v2(wrong_admin)
        .address();
    approve(&fixture, &fixture.investor, 1_000);

    let result = pool_client(&fixture).try_fund_pool(
        &fixture.investor,
        &POOL_ID,
        &wrong_asset,
        &1_000,
        &String::from_str(&fixture.env, "fund-wrong-asset"),
    );

    assert_eq!(result.unwrap_err().unwrap(), ContractError::WrongAsset);
    assert_eq!(
        token_client(&fixture.env, &fixture.asset).balance(&fixture.contract_id),
        0
    );
}

#[test]
fn duplicate_reference_does_not_double_fund_or_repay() {
    let fixture = create_fixture();
    let token = token_client(&fixture.env, &fixture.asset);

    approve(&fixture, &fixture.investor, 2_000);
    let first = pool_client(&fixture)
        .try_fund_pool(
            &fixture.investor,
            &POOL_ID,
            &fixture.asset,
            &2_000,
            &String::from_str(&fixture.env, "fund-idem"),
        )
        .unwrap()
        .unwrap();
    let retry = pool_client(&fixture)
        .try_fund_pool(
            &fixture.investor,
            &POOL_ID,
            &fixture.asset,
            &2_000,
            &String::from_str(&fixture.env, "fund-idem"),
        )
        .unwrap()
        .unwrap();
    let mismatched = pool_client(&fixture).try_fund_pool(
        &fixture.investor,
        &POOL_ID,
        &fixture.asset,
        &500,
        &String::from_str(&fixture.env, "fund-idem"),
    );

    assert_eq!(retry, first);
    assert_eq!(token.balance(&fixture.contract_id), 2_000);
    assert_eq!(
        mismatched.unwrap_err().unwrap(),
        ContractError::DuplicateReference
    );

    approve(&fixture, &fixture.repayer, 700);
    pool_client(&fixture)
        .try_record_repayment(
            &fixture.repayer,
            &POOL_ID,
            &fixture.investor,
            &fixture.asset,
            &700,
            &String::from_str(&fixture.env, "repay-idem"),
        )
        .unwrap()
        .unwrap();
    pool_client(&fixture)
        .try_record_repayment(
            &fixture.repayer,
            &POOL_ID,
            &fixture.investor,
            &fixture.asset,
            &700,
            &String::from_str(&fixture.env, "repay-idem"),
        )
        .unwrap()
        .unwrap();

    assert_eq!(token.balance(&fixture.repayer), 9_300);
}

#[test]
fn concurrent_last_unit_funding_never_exceeds_limits() {
    let fixture = create_fixture();
    let second_investor = Address::generate(&fixture.env);
    token::StellarAssetClient::new(&fixture.env, &fixture.asset).mint(&second_investor, &TARGET);

    fund(&fixture, &fixture.investor, 7_000, "fund-a");
    fund(&fixture, &second_investor, 3_000, "fund-b");
    approve(&fixture, &second_investor, 1_000);

    let oversubscribed = pool_client(&fixture).try_fund_pool(
        &second_investor,
        &POOL_ID,
        &fixture.asset,
        &1_000,
        &String::from_str(&fixture.env, "fund-c"),
    );
    let pool = pool_client(&fixture)
        .try_read_pool(&POOL_ID)
        .unwrap()
        .unwrap();

    assert_eq!(
        oversubscribed.unwrap_err().unwrap(),
        ContractError::Oversubscribed
    );
    assert_eq!(pool.total_invested, TARGET);
    assert_eq!(pool.funded_units, UNITS);
}

#[test]
fn repayment_requires_existing_position_and_rejects_overpayment() {
    let fixture = create_fixture();
    let other_investor = Address::generate(&fixture.env);

    approve(&fixture, &fixture.repayer, 100);
    let missing = pool_client(&fixture).try_record_repayment(
        &fixture.repayer,
        &POOL_ID,
        &other_investor,
        &fixture.asset,
        &100,
        &String::from_str(&fixture.env, "repay-missing"),
    );
    assert_eq!(
        missing.unwrap_err().unwrap(),
        ContractError::InvestorPositionNotFound
    );

    fund(&fixture, &fixture.investor, 1_000, "fund-1");
    approve(&fixture, &fixture.repayer, 1_001);
    let overpayment = pool_client(&fixture).try_record_repayment(
        &fixture.repayer,
        &POOL_ID,
        &fixture.investor,
        &fixture.asset,
        &1_001,
        &String::from_str(&fixture.env, "repay-over"),
    );

    assert_eq!(
        overpayment.unwrap_err().unwrap(),
        ContractError::Overpayment
    );
}

#[test]
fn refunds_return_custody_and_reduce_principal_units() {
    let fixture = create_fixture();
    let token = token_client(&fixture.env, &fixture.asset);

    fund(&fixture, &fixture.investor, 2_000, "fund-1");
    let position = pool_client(&fixture)
        .try_refund_position(
            &fixture.owner,
            &POOL_ID,
            &fixture.investor,
            &500,
            &String::from_str(&fixture.env, "refund-1"),
        )
        .unwrap()
        .unwrap();
    let pool = pool_client(&fixture)
        .try_read_pool(&POOL_ID)
        .unwrap()
        .unwrap();

    assert_eq!(position.invested, 1_500);
    assert_eq!(position.refunded, 500);
    assert_eq!(position.units, 15);
    assert_eq!(pool.total_invested, 1_500);
    assert_eq!(pool.funded_units, 15);
    assert_eq!(token.balance(&fixture.contract_id), 1_500);
    assert_eq!(token.balance(&fixture.investor), 8_500);
}

#[test]
fn conservation_of_value_holds_across_funding_refund_and_repayment() {
    let fixture = create_fixture();
    let token = token_client(&fixture.env, &fixture.asset);
    let initial_supply = token.balance(&fixture.investor) + token.balance(&fixture.repayer);

    fund(&fixture, &fixture.investor, 3_000, "fund-1");
    pool_client(&fixture)
        .try_refund_position(
            &fixture.owner,
            &POOL_ID,
            &fixture.investor,
            &1_000,
            &String::from_str(&fixture.env, "refund-1"),
        )
        .unwrap()
        .unwrap();
    approve(&fixture, &fixture.repayer, 2_000);
    pool_client(&fixture)
        .try_record_repayment(
            &fixture.repayer,
            &POOL_ID,
            &fixture.investor,
            &fixture.asset,
            &2_000,
            &String::from_str(&fixture.env, "repay-1"),
        )
        .unwrap()
        .unwrap();

    let observed_supply = token.balance(&fixture.investor)
        + token.balance(&fixture.repayer)
        + token.balance(&fixture.contract_id);

    assert_eq!(observed_supply, initial_supply);
}
