/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FACTORY_ADDRESS?: string;
  readonly VITE_BASE_SEPOLIA_RPC_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_ONCHAINKIT_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
