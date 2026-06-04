/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FACTORY_ADDRESS?: string;
  readonly VITE_ONCHAINKIT_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
