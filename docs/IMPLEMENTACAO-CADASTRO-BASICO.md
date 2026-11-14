# Implementação: Cadastro Básico na Compra (Opção C)

**Data:** 14/11/2026  
**Status:** ✅ Implementado, aguardando teste

## Problema Resolvido

**Antes:** Checkout exigia login prévio (`redirect("/login")` na linha 32)  
**Conflito:** Auditoria identificou regra de "compra de visitante" (decisão 12/11)

**Agora:** Visitante pode comprar sem cadastro prévio — cria conta básica no checkout.

---

## Arquivos Criados

### 1. `src/app/checkout/cadastro-actions.ts`
Server action `cadastrarBasicoParaCompra`:
- Valida dados (nome 3+, email válido, telefone 10+, senha 6+)
- Cria usuário no Supabase Auth (auto-confirmado)
- Cria profile (papel 'cliente', status 'ativo')
- Cria customer vinculado ao user_id
- Audit log `cadastro.criado_na_compra`
- **Rollback automático** se qualquer etapa falhar
- Retorna URL de login com `?next=/checkout`

### 2. `src/components/checkout/CadastroBasicoForm.tsx`
Form client component:
- Campos: nome, email, telefone, senha
- Validação frontend (required, tipos corretos)
- useTransition para loading state
- Mensagens de erro amigáveis
- Link para login existente
- Estilo consistente com o resto do checkout

### 3. `src/app/checkout/page.tsx` (modificado)
- **Linha 32-35**: Se `!user`, renderiza `<CadastroBasicoForm />` (antes redirecionava)
- Import adicionado: `CadastroBasicoForm`

---

## Diferença: Cadastro Básico vs Portal do Cliente

| Campo | Cadastro Básico (obrigatório na compra) | Portal do Cliente (opcional depois) |
|-------|----------------------------------------|--------------------------------------|
| Nome | ✅ | ✅ |
| E-mail | ✅ | ✅ |
| Telefone | ✅ | ✅ |
| Senha | ✅ | ✅ |
| Endereço | ❌ (pede no checkout) | ✅ |
| CPF/CNPJ | ❌ | ✅ |
| Observações | ❌ | ✅ |
| Limite de crédito | ❌ | ✅ (gestão) |

**Cadastro básico** = mínimo para criar conta + comprar agora.  
**Portal** = completar perfil com mais dados (endereços salvos, documentos, histórico).

---

## Fluxo Completo Implementado

```
┌─────────────────────────────────────────────┐
│ 1. Visitante navega loja (anônimo)         │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ 2. Adiciona produtos ao carrinho            │
│    (localStorage, client-side)               │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ 3. Clica "Finalizar compra" → /checkout    │
└──────────────┬──────────────────────────────┘
               │
               ▼
        ┌──────────────┐
        │ Logado?      │
        └──┬───────┬───┘
           │ Não   │ Sim
           ▼       ▼
    ┌──────────┐  ┌────────────────────┐
    │ NOVO:    │  │ CheckoutForm       │
    │ Cadastro │  │ (endereço + frete  │
    │ Básico   │  │ + pagamento)       │
    └─────┬────┘  └────────────────────┘
          │
          │ Preenche nome, email,
          │ telefone, senha
          ▼
    ┌───────────────────────┐
    │ cadastrarBasicoParaCompra │
    │ - Cria Auth user      │
    │ - Cria profile        │
    │ - Cria customer       │
    └─────┬─────────────────┘
          │
          ▼
    ┌───────────────────────┐
    │ Redirect /login       │
    │ ?next=/checkout       │
    │ &email=...            │
    └─────┬─────────────────┘
          │
          │ Faz login automático
          ▼
    ┌────────────────────────┐
    │ Volta ao /checkout     │
    │ (agora logado)         │
    └────────┬───────────────┘
             │
             ▼
    ┌────────────────────────┐
    │ CheckoutForm           │
    │ (prossegue com compra) │
    └────────────────────────┘
```

---

## Próximos Passos (Teste)

### Teste Manual (task #7)

1. **Limpar sessão:**
   ```js
   // No console do navegador:
   localStorage.clear();
   // Depois: Application → Cookies → limpar tudo de localhost:3000
   ```

2. **Fluxo visitante:**
   - Navegar http://localhost:3000 (anônimo)
   - Adicionar 2-3 produtos ao carrinho
   - Clicar "Finalizar compra"
   - **Esperado:** form de cadastro básico (4 campos)

3. **Cadastro:**
   - Preencher: nome, email novo, telefone, senha
   - Clicar "Criar conta e continuar"
   - **Esperado:** redirect para /login?next=/checkout

4. **Login automático:**
   - **Esperado:** form de login com email pré-preenchido
   - Digitar senha
   - Login → redirect /checkout

5. **Checkout normal:**
   - **Esperado:** CheckoutForm com endereço + frete
   - Preencher dados
   - Finalizar pedido → Mercado Pago

6. **Validar banco (staging):**
   ```sql
   -- Novo usuário criado
   select id, email, created_at 
   from auth.users 
   where email = '<email_teste>' 
   order by created_at desc limit 1;
   
   -- Profile criado (papel 'cliente')
   select id, full_name, role, status 
   from profiles 
   where id = '<user_id>';
   
   -- Customer criado (vinculado)
   select id, user_id, name, email, phone 
   from customers 
   where user_id = '<user_id>';
   
   -- Audit log
   select event_type, created_at, event_data 
   from audit_log 
   where event_type = 'cadastro.criado_na_compra' 
   order by created_at desc limit 1;
   ```

### Teste E2E (depois do manual)

Criar `e2e/cadastro-basico-compra.cjs`:
- Visitante anônimo
- Adiciona produto
- Checkout → cadastro básico
- Criar conta
- Login
- Finalizar pedido (mock MP)
- Validar: user, profile, customer, order

---

## Rollback (se necessário)

Se precisar reverter:

1. **Restaurar redirect:**
   ```ts
   // src/app/checkout/page.tsx linha 32
   if (!user) redirect("/login?next=/checkout");
   ```

2. **Remover arquivos:**
   ```bash
   rm src/app/checkout/cadastro-actions.ts
   rm src/components/checkout/CadastroBasicoForm.tsx
   ```

3. **Remover import:**
   ```ts
   // src/app/checkout/page.tsx
   // Apagar: import { CadastroBasicoForm } from "@/components/checkout/CadastroBasicoForm";
   ```

---

## Melhorias Futuras (Backlog)

1. **Validação de telefone formatada:**
   - Máscara `(00) 00000-0000` com `react-input-mask`
   - Validação DDD válido

2. **Confirmação de email:**
   - Enviar link de confirmação (opcional, não bloqueia compra)
   - Flag `email_confirmed` em profile

3. **Login OAuth:**
   - Google, Facebook (Supabase Auth suporta)
   - Agiliza cadastro

4. **Carrinho persistente cross-device:**
   - Salvar em `carts` table quando logar
   - Sincronizar entre dispositivos

5. **Checkout guest completo (sem conta):**
   - Opção "Comprar sem criar conta"
   - Cria pedido sem user_id (apenas email para notificação)
   - Usuário decide criar conta depois

---

## Commits Relacionados

- [ ] `feat(checkout): adicionar cadastro básico na compra (opção C)`
- [ ] `test(e2e): fluxo visitante → cadastro → compra`
- [ ] `docs(agents): atualizar regra de checkout sem login prévio`

---

**Status final:** Implementação completa. Pronto para teste manual → E2E → deploy staging → produção.
