-- 0018_vendas_v5_rpc.sql - Modulo Vendas v5 (modulo-vendas.md v1.0, 02/10/2026).
-- Contexto (roadmap F5/Vendas):
--   * vendas_convert_to_sale: VD-03 - etapa 'pedido' vira 'venda' com numero
--     V- (seq_venda_numero, 0015) e baixa de estoque via
--     register_stock_movement('venda') (5.8); validacoes VL-01..VL-03
--     (pelo menos 1 item; atacado exige CNPJ do cliente; canal exige nome
--     do cliente); tudo numa unica funcao = ou converte tudo ou nao
--     converte nada (saldo insuficiente derruba a conversao inteira, sem
--     estoque "meio baixado" - mesma semantica do pdv_register_sale);
--   * vendas_import_loja: aba "Importar da loja" (secao 4) - atribui numero
--     P- (seq_pedido_numero, 0015) e etapa 'pedido' aos pedidos origem='loja'
--     ainda sem pedido_numero; guarda idempotente: ids repetidos, pedidos ja
--     importados e pedidos que nao sao da loja sao ignorados (re-execucao
--     importa 0);
--   * numeracao so existe em SQL (nextval) - por isso conversao e importacao
--     sao funcoes e nao escrita direta da server action;
--   * permissoes: so service_role (as server actions de /vendas usam o admin
--     client); negado a public/anon/authenticated (mesma formula da 0015,
--     inclusive para derrubar o grant do default privileges do Supabase).
-- begin/commit igual ao 0009-0017.

begin;

-- conversao de pedido em venda ------------------------------------------------
create or replace function vendas_convert_to_sale(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_doc text;
  v_nome text;
  v_numero text;
  v_item record;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'PEDIDO_NAO_ENCONTRADO';
  end if;
  if v_order.cancelado_em is not null then
    raise exception 'DOCUMENTO_CANCELADO';
  end if;
  if v_order.etapa = 'venda' then
    raise exception 'JA_E_VENDA';
  end if;
  if v_order.etapa is distinct from 'pedido' then
    raise exception 'ETAPA_NAO_E_PEDIDO';
  end if;

  -- VL-01
  if not exists (select 1 from order_items where order_id = p_order_id) then
    raise exception 'SEM_ITENS';
  end if;

  select coalesce(c.documento, ''), coalesce(c.name, '')
    into v_doc, v_nome
    from customers c where c.id = v_order.customer_id;
  v_doc := coalesce(regexp_replace(v_doc, '\D', '', 'g'), '');

  -- VL-02 (atacado exige CNPJ de 14 digitos)
  if v_order.channel = 'atacado' and v_doc !~ '^[0-9]{14}$' then
    raise exception 'ATACADO_SEM_CNPJ';
  end if;
  -- VL-03 (canal exige nome do cliente)
  if v_order.channel <> 'varejo' and nullif(trim(v_nome), '') is null then
    raise exception 'SEM_NOME_CLIENTE';
  end if;

  -- baixa direta por item (sem reserva); item sem item_id (snapshot antigo)
  -- nao movimenta estoque. Erro de saldo derruba a conversao inteira.
  for v_item in
    select item_id, quantity from order_items
     where order_id = p_order_id and item_id is not null
  loop
    perform register_stock_movement(
      v_item.item_id, 'venda', v_item.quantity, 'order', p_order_id,
      'vendas', null);
  end loop;

  v_numero := 'V-' || lpad(nextval('seq_venda_numero')::text, 4, '0');
  update orders
     set etapa = 'venda',
         convertido_em = coalesce(convertido_em, now()),
         venda_numero = v_numero
   where id = p_order_id
  returning venda_numero into v_numero;

  return jsonb_build_object(
    'order_id', p_order_id, 'venda_numero', v_numero);
end $$;

-- importacao de pedidos da loja ------------------------------------------------
create or replace function vendas_import_loja(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 or array_length(p_ids, 1) > 200 then
    raise exception 'LISTA_INVALIDA';
  end if;

  foreach v_id in array p_ids loop
    -- guarda idempotente: so pedidos da loja ainda sem numero entram
    update orders
       set pedido_numero = 'P-' || lpad(nextval('seq_pedido_numero')::text, 4, '0'),
           etapa = 'pedido'
     where id = v_id
       and origem = 'loja'
       and pedido_numero is null
       and cancelado_em is null;
    if found then
      v_n := v_n + 1;
    end if;
  end loop;

  return jsonb_build_object('importados', v_n);
end $$;

-- permissoes: so as server actions (admin client = service_role) --------------
revoke execute on function vendas_convert_to_sale(uuid)
  from public, anon, authenticated;
revoke execute on function vendas_import_loja(uuid[])
  from public, anon, authenticated;
grant execute on function vendas_convert_to_sale(uuid) to service_role;
grant execute on function vendas_import_loja(uuid[]) to service_role;

commit;
