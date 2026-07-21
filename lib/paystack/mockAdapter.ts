import {
  FetchTransactionsQuery,
  IPaystackAdapter,
  PaystackPaginatedResponse,
  PaystackTransactionRecord,
} from "./types"

export class MockPaystackAdapter implements IPaystackAdapter {
  private mockRecords: PaystackTransactionRecord[]

  constructor(initialRecords: PaystackTransactionRecord[] = []) {
    this.mockRecords = initialRecords
  }

  setRecords(records: PaystackTransactionRecord[]) {
    this.mockRecords = records
  }

  async fetchTransactions(
    query: FetchTransactionsQuery,
  ): Promise<PaystackPaginatedResponse<PaystackTransactionRecord>> {
    let filtered = [...this.mockRecords]

    if (query.from) {
      const fromTime = new Date(query.from).getTime()
      filtered = filtered.filter((r) => new Date(r.created_at).getTime() >= fromTime)
    }

    if (query.to) {
      const toTime = new Date(query.to).getTime()
      filtered = filtered.filter((r) => new Date(r.created_at).getTime() <= toTime)
    }

    if (query.status) {
      filtered = filtered.filter((r) => r.status === query.status)
    }

    const page = query.page || 1
    const perPage = query.perPage || 50
    const startIdx = (page - 1) * perPage
    const paginated = filtered.slice(startIdx, startIdx + perPage)
    const pageCount = Math.ceil(filtered.length / perPage) || 1

    return {
      status: true,
      message: "Mock transactions retrieved successfully",
      data: paginated,
      meta: {
        total: filtered.length,
        skipped: startIdx,
        perPage,
        page,
        pageCount,
      },
    }
  }

  async verifyTransaction(reference: string): Promise<PaystackTransactionRecord | null> {
    const found = this.mockRecords.find((r) => r.reference === reference)
    return found || null
  }
}
