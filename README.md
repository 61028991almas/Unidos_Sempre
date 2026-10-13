# Unidos Sempre — Painel de Clientes

Painel responsivo pronto para **GitHub Pages**, com interface em português, desenvolvido em HTML/CSS/JavaScript (sem framework obrigatório). Inclui demonstração offline/local e uma integração opcional com **Supabase** para armazenamento remoto e login real.

## O que o painel faz

- **Visão geral:** total de clientes, pedidos, pendências e valores pagos, gráfico mensal e pedidos recentes.
- **Clientes:** cadastrar, editar, consultar e excluir; tag Hay Day, WhatsApp, status e observações.
- **Compras:** criar compras **conjuntas** e **individuais**, organizar lotes e conferir totais.
- **Pedidos:** vincular cliente e compra, escolher kit (Celeiro/Silo/Terreno), duração, quantidade, pagamento e entrega.
- **Preços sugeridos:** 5, 10, 20 e 30 dias; ajustáveis por pedido.
- **Monitoramento:** contagem de **20 horas a partir do envio da solicitação pelo fornecedor**, alertas para prazo encerrado e últimas 4 horas, confirmação manual de coleta, mensagem pronta para copiar para WhatsApp.
- **Relatórios:** CSV compatível com Excel/Planilhas; backup JSON e restauração no modo demo.
- **Dois perfis:** administrador gerencia dados; cliente só visualiza os registros vinculados a ele no modo remoto, graças às regras RLS.
- **Sem bot do Telegram.** Não faz entregas automáticas dentro do Hay Day (não existe integração oficial aqui).

## 1. Testar o painel gratuitamente

Abra o `index.html` num navegador, ou publique os arquivos no GitHub Pages. Enquanto os campos de `config.js` estiverem vazios, o painel entra no **modo demonstração** com clientes e pedidos fictícios.

As alterações do modo demo são salvas em `localStorage`: só existem naquele navegador, podendo desaparecer se os dados do navegador forem apagados. Em **Configurações**, é possível alternar entre perfis de demonstração, exportar ou restaurar o backup. **Esta alternância é apenas visual, NÃO é login/autorização real.** Não use dados pessoais ou financeiros verdadeiros no modo demo em um computador compartilhado.

## 2. Publicar no GitHub Pages

1. Entre no [GitHub](https://github.com/) e crie um repositório chamado `unidos-sempre-painel`.
2. Envie **todos os arquivos desta pasta para a raiz** do repositório. Ao usar o `.zip`, primeiro **extraia** os arquivos; o GitHub Pages precisa encontrar `index.html` na raiz.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Selecione **main** e **/(root)** e clique em **Save**.
6. Quando a publicação terminar, o endereço normalmente será `https://SEU_USUARIO.github.io/unidos-sempre-painel/`.

**Importante:** GitHub Pages hospeda arquivos estáticos, não fornece banco de dados nem autenticação. O site publicado fica publicamente acessível, portanto **nunca inclua senhas, chaves secretas ou dados de clientes no repositório**. Os dados reais devem ficar no Supabase protegidos por login e RLS.

Documentação oficial: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 3. Ativar modo real multiusuário com Supabase

1. Crie um projeto em https://supabase.com/.
2. No **SQL Editor** do Supabase, cole e execute todo o conteúdo de `schema.sql`.
3. Em **Authentication → Users**, crie/convide sua conta administrativa. Se o usuário já existia, `schema.sql` também insere seu perfil quando executado.
4. No SQL Editor, execute, trocando seu e-mail:

   ```sql
   update public.profiles set role='admin'
   where id=(select id from auth.users where email='SEU_EMAIL_AQUI');
   ```

5. No painel do Supabase, em **Project Settings → API** (ou **Connect**, conforme a versão), localize a **Project URL** e a chave **publishable / anon**. Edite `config.js`:

   ```javascript
   window.UNIDOS_SEMPRE_CONFIG = {
     supabaseUrl: 'https://SEU_PROJETO.supabase.co',
     supabaseAnonKey: 'SUA_CHAVE_PUBLICAVEL'
   };
   ```

6. **Jamais use a chave `service_role`, `secret` ou a senha do banco** nesse arquivo. A chave publicável/anon é feita para uso no navegador **desde que o RLS esteja devidamente aplicado**, como no `schema.sql`.
7. Envie `config.js` atualizado para o GitHub. Reabra o site. Agora o sistema exigirá e-mail e senha.
8. Faça login como admin e cadastre clientes e pedidos.
9. Para dar acesso a um cliente, crie uma conta para ele em **Authentication → Users** e associe o perfil ao cadastro de cliente em **SQL Editor**:

   ```sql
   update public.profiles
   set client_id=(select id from public.clients where tag='#TAG_DO_CLIENTE' limit 1)
   where id=(select id from auth.users where email='CLIENTE@EXEMPLO.COM');
   ```

   É preferível associar pelo **ID** do cliente se tags forem repetidas. Cada usuário com papel `usuario` vê apenas seu próprio cliente e pedidos relacionados; não pode alterar pedidos, pagamentos ou perfis. O administrador faz a vinculação usando o SQL Editor.

## 4. Boas práticas de operação

- Registre a **data/hora em que a solicitação do fornecedor foi enviada**. O painel calcula o prazo de 20h automaticamente ao consultar a página.
- Marque **Coletado** somente depois de o cliente realmente retirar o kit no Hay Day.
- Os alertas são exibidos **enquanto o painel está aberto/é atualizado**; não são notificações em segundo plano, não enviam WhatsApp automaticamente e não executam tarefas sem a aba aberta.
- O acesso de cliente é **somente leitura** por segurança. O administrador registra e atualiza as entregas.
- A atribuição do papel de administrador ocorre no Supabase SQL Editor. **Nunca** permita que usuários elevem seus próprios privilégios.
- Faça backups, atualize senhas e respeite a LGPD ao cadastrar telefones e outras informações pessoais.

## Estrutura dos arquivos

```text
unidos-sempre-painel/
├── index.html    # Interface
├── styles.css    # Visual responsivo
├── app.js        # Cadastros, filtros, cálculos e integração
├── config.js     # Configuração pública Supabase (vazia por padrão)
├── schema.sql    # Banco e políticas de segurança
├── favicon.svg   # Ícone
├── .nojekyll     # Instrução de publicação para GitHub Pages
└── README.md     # Este guia
```
