import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Só as regras dos hooks: o tsc já cobre os tipos, e um erro de dependência num efeito é o tipo de
// bug que nenhum dos dois pega sozinho.
export default tseslint.config(
  { ignores: ["dist", "src-tauri", "worker", "gnome-extension", "test-results"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
);
