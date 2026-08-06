import { defineConfig } from "vitest/config";

/**
 * Los tests de la app cubren la lógica pura (repositorios y utilidades del plan),
 * que es lo que sostiene los criterios de aceptación de persistencia. No renderiza
 * componentes de React Native: eso se verifica corriendo la app.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@ridelab/shared": new URL("../../packages/shared/src/index.ts", import.meta.url).pathname,
      "@react-native-async-storage/async-storage": new URL(
        "./src/test/asyncStorageMock.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
