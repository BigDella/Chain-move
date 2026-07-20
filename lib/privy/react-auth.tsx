"use client"

import type { ReactNode } from "react"
import {
  PrivyProvider as RealPrivyProvider,
  useFundWallet as useRealFundWallet,
  useIdentityToken as useRealIdentityToken,
  useLogout as useRealLogout,
  usePrivy as useRealPrivy,
  useWallets as useRealWallets,
} from "@privy-io/react-auth"

export type { FundWalletConfig, UseFundWalletInterface } from "@privy-io/react-auth"

const hasPrivyAppId = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim())

type PrivyHookResult = ReturnType<typeof useRealPrivy>
type IdentityTokenResult = ReturnType<typeof useRealIdentityToken>
type WalletsResult = ReturnType<typeof useRealWallets>
type LogoutResult = ReturnType<typeof useRealLogout>
type FundWalletResult = ReturnType<typeof useRealFundWallet>

function FallbackPrivyProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

const PrivyProviderImpl = hasPrivyAppId ? RealPrivyProvider : FallbackPrivyProvider

export function PrivyProvider({ children, ...props }: { children: ReactNode; [key: string]: unknown }) {
  return <PrivyProviderImpl {...(props as unknown as Parameters<typeof RealPrivyProvider>[0])}>{children}</PrivyProviderImpl>
}

function fallbackPrivy(): PrivyHookResult {
  return {
    ready: true,
    authenticated: false,
    user: null,
    login: () => undefined,
    logout: async () => undefined,
    getAccessToken: async () => null,
  } as PrivyHookResult
}

function fallbackIdentityToken(): IdentityTokenResult {
  return { identityToken: null } as IdentityTokenResult
}

function fallbackWallets(): WalletsResult {
  return { ready: true, wallets: [] } as unknown as WalletsResult
}

function fallbackFundWallet(): FundWalletResult {
  return {
    fundWallet: async () => ({}) as unknown,
  } as unknown as FundWalletResult
}

function fallbackLogout(): LogoutResult {
  return {
    logout: async () => undefined,
  } as unknown as LogoutResult
}

const usePrivyImpl = hasPrivyAppId ? useRealPrivy : fallbackPrivy
const useIdentityTokenImpl = hasPrivyAppId ? useRealIdentityToken : fallbackIdentityToken
const useWalletsImpl = hasPrivyAppId ? useRealWallets : fallbackWallets
const useFundWalletImpl = hasPrivyAppId ? useRealFundWallet : fallbackFundWallet
const useLogoutImpl = hasPrivyAppId ? useRealLogout : fallbackLogout

export function usePrivy(): PrivyHookResult {
  return usePrivyImpl()
}

export function useIdentityToken(): IdentityTokenResult {
  return useIdentityTokenImpl()
}

export function useWallets(): WalletsResult {
  return useWalletsImpl()
}

export function useFundWallet(): FundWalletResult {
  return useFundWalletImpl()
}

export function useLogout(): LogoutResult {
  return useLogoutImpl()
}
