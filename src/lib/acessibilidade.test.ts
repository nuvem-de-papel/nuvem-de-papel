import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAVE_A11Y, PREFS_PADRAO, SCRIPT_PREFS_A11Y, ehPadrao, lerPrefs, limitarZoom } from "./acessibilidade";

test("zoom fica entre 80 e 150, em passos de 10", () => {
  assert.equal(limitarZoom(100), 100);
  assert.equal(limitarZoom(70), 80);
  assert.equal(limitarZoom(160), 150);
  assert.equal(limitarZoom(114), 110);
  assert.equal(limitarZoom(Number.NaN), 100);
});

test("preferencia salva com lixo volta ao padrao", () => {
  assert.deepEqual(lerPrefs(null), PREFS_PADRAO);
  assert.deepEqual(lerPrefs("{quebrado"), PREFS_PADRAO);
  assert.deepEqual(lerPrefs("42"), PREFS_PADRAO);
  const p = lerPrefs(JSON.stringify({ zoom: 999, contraste: true, guiaLeitura: "sim", outra: 1 }));
  assert.equal(p.zoom, 150);
  assert.equal(p.contraste, true);
  assert.equal(p.guiaLeitura, false); // so true de verdade liga
  assert.equal(ehPadrao(p), false);
  assert.equal(ehPadrao(lerPrefs(null)), true);
});

test("script do head le a mesma chave e as mesmas classes", () => {
  assert.match(SCRIPT_PREFS_A11Y, new RegExp(`"${CHAVE_A11Y}"`));
  for (const c of ["a11y-contraste", "a11y-links", "a11y-guia", "a11y-sem-animacao", "a11y-espaco-linhas"]) {
    assert.ok(SCRIPT_PREFS_A11Y.includes(c), c);
  }
  // script e JS valido
  assert.doesNotThrow(() => new Function(SCRIPT_PREFS_A11Y));
});
