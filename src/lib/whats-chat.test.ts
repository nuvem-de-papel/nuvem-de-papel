import { test } from "node:test";
import assert from "node:assert/strict";
import { MARCA_CHAT, OPCOES_CHAT, emAtendimento, linkWhatsChat, montarMensagemWhats, urlDoProduto } from "./whats-chat";

test("horario de atendimento em Brasilia (UTC-3)", () => {
  assert.equal(emAtendimento(new Date("2026-11-03T15:00:00Z")), true);
  assert.equal(emAtendimento(new Date("2026-11-03T11:30:00Z")), false);
  assert.equal(emAtendimento(new Date("2026-11-06T20:59:00Z")), true);
  assert.equal(emAtendimento(new Date("2026-11-06T21:00:00Z")), false);
  assert.equal(emAtendimento(new Date("2026-11-07T13:00:00Z")), true);
  assert.equal(emAtendimento(new Date("2026-11-07T16:00:00Z")), false);
  assert.equal(emAtendimento(new Date("2026-11-08T15:00:00Z")), false);
});

test("mensagem leva a pagina do produto, sem query nem hash", () => {
  const url = urlDoProduto("https://x.com", "/produtos/BLT40");
  assert.equal(url, "https://x.com/produtos/BLT40");
  assert.equal(urlDoProduto("https://x.com", "/produtos"), undefined);
  assert.match(montarMensagemWhats("fazer um orçamento", url), /Estou vendo este produto: https:\/\/x\.com\/produtos\/BLT40$/);
  assert.doesNotMatch(montarMensagemWhats("fazer um orçamento"), /Estou vendo/);
});

test("link do WhatsApp usa o numero da loja e codifica o texto", () => {
  const l = linkWhatsChat("fazer um orçamento");
  assert.ok(l.startsWith(`${MARCA_CHAT.whatsapp}?text=`));
  assert.ok(!l.includes(" "));
  assert.ok(OPCOES_CHAT.length >= 2 && OPCOES_CHAT.length <= 5);
});
