// Permite rodar testes .ts no Node sem dependencias: resolve imports sem extensao.
import { register } from "node:module";
register("./resolver-ts.mjs", import.meta.url);
