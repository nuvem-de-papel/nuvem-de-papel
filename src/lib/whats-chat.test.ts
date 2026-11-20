import { test } from "node:test";
import assert from "node:assert/strict";
import { MARCA_CHAT, OPCOES_CHAT, emAtendimento, linkWhatsChat, montarMensagemWhats, urlDoProduto } from "./whats-chat";

test("horario de atendimento em Brasilia (UTC-3)", () => {
  assert.equal(emAtendimento(new Date("2026-11-03T11:00:00Z")), true); // ter 8h
  assert.equal(emAtendimento(new Date("2026-11-03T10:59:00Z")), false); // ter 7h59
  assert.equal(emAtendimento(new Date("2026-11-06T21:29:00Z")), true); // sex 18h29
  assert.equal(emAtendimento(new Date("2026-11-06T21:30:00Z")), false); // sex 18h30
  assert.equal(emAtendimento(new Date("2026-11-07T20:00:00Z")), true); // sab 17h
  assert.equal(emAtendimento(new Date("2026-11-08T15:00:00Z")), false); // dom
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
