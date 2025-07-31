# Roteiro de Testes e Formulário de Feedback - Assistente Corporativo Bob

## 1. Roteiro de Testes Funcionais

Este roteiro descreve os cenários de teste essenciais para garantir o funcionamento correto da aplicação.

### 1.1. Autenticação e Acesso

| ID    | Cenário                                  | Passos                                                                                                                              | Resultado Esperado                                                                        |
| :---- | :--------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- |
| **A-01** | Login com e-mail permitido (3A RIVA)     | 1. Acessar a página inicial. <br> 2. Clicar em "Entrar". <br> 3. Autenticar com uma conta Google `@3ariva.com.br`.                      | Login bem-sucedido. Redirecionamento para a página de chat.                               |
| **A-02** | Login com e-mail permitido (3A Invest)   | 1. Acessar a página inicial. <br> 2. Clicar em "Entrar". <br> 3. Autenticar com uma conta Google `@3ainvestimentos.com.br`.            | Login bem-sucedido. Redirecionamento para a página de chat.                               |
| **A-03** | Login com e-mail não permitido         | 1. Acessar a página inicial. <br> 2. Clicar em "Entrar". <br> 3. Autenticar com uma conta Google de outro domínio (ex: `@gmail.com`). | Toast de erro "Acesso Negado" é exibido. O usuário não é redirecionado para o chat.      |
| **A-04** | Login de Admin em Modo de Manutenção   | 1. Ativar o modo de manutenção no painel de admin. <br> 2. Fazer logout. <br> 3. Fazer login com a conta de administrador.            | Login bem-sucedido. Acesso ao chat e ao painel de admin.                                  |
| **A-05** | Login de usuário em Modo de Manutenção | 1. Ativar o modo de manutenção. <br> 2. Tentar logar com uma conta de usuário comum (não-admin).                                        | Toast de erro "Sistema em manutenção" é exibido. Login é bloqueado.                       |

### 1.2. Interação no Chat e Análise de Arquivos

| ID    | Cenário                                     | Passos                                                                                                        | Resultado Esperado                                                                                             |
| :---- | :------------------------------------------ | :------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------- |
| **C-01** | Envio de pergunta simples (RAG)             | 1. Iniciar um novo chat. <br> 2. Digitar uma pergunta que dependa da base de conhecimento interna.          | A IA responde com base nos dados internos e cita as fontes.                                                    |
| **C-02** | Falha na busca RAG e fallback para Web      | 1. Fazer uma pergunta cuja resposta não está na base interna. <br> 2. Clicar no botão "Pesquisar na Web".   | A IA primeiro retorna a mensagem de falha. Após o clique, a IA responde com base em uma busca web.             |
| **C-03** | Análise de arquivo PDF                      | 1. Anexar um arquivo `.pdf`. <br> 2. Fazer uma pergunta sobre o conteúdo do arquivo (ex: "resuma este doc"). | A IA responde com base no conteúdo extraído do PDF.                                                            |
| **C-04** | Análise de arquivo Word (.docx)             | 1. Anexar um arquivo `.docx`. <br> 2. Fazer uma pergunta sobre o conteúdo.                                    | A IA responde com base no conteúdo extraído do Word.                                                           |
| **C-05** | Análise de arquivo Excel (.xlsx)            | 1. Anexar um arquivo `.xlsx`. <br> 2. Fazer uma pergunta sobre os dados da planilha.                          | A IA responde com base nos dados extraídos e formatados do Excel.                                              |
| **C-06** | Análise com Preamble de Posição Consolidada | 1. Anexar um relatório PDF da XP. <br> 2. Digitar "faça a análise com nosso padrão".                          | A IA responde de forma estruturada, seguindo o modelo do preamble de Posição Consolidada.                    |
| **C-07** | Interação por Voz (Gravação de áudio)       | 1. Clicar no ícone de microfone e gravar uma pergunta. <br> 2. A transcrição aparece na caixa de texto.      | A pergunta é transcrita corretamente, e a IA responde à pergunta transcrita.                                  |
| **C-08** | Detecção e anonimização de PII (DLP)        | 1. Fazer uma pergunta contendo um nome e um CPF (ex: "Qual o status de João da Silva, CPF 123.456.789-00?"). | A pergunta é salva com os dados anonimizados (`[PERSON_NAME]`, `[BRAZIL_CPF_NUMBER]`). Um alerta DLP é gerado. |

### 1.3. Organização e Gerenciamento (Sidebar)

| ID    | Cenário                      | Passos                                                                                                         | Resultado Esperado                                                                          |
| :---- | :--------------------------- | :------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **S-01** | Criar um novo Projeto        | 1. Clicar em "Novo projeto". <br> 2. Dar um nome e salvar.                                                    | O novo projeto aparece na barra lateral.                                                    |
| **S-02** | Renomear um Projeto          | 1. Clicar nos "..." de um projeto. <br> 2. Selecionar "Renomear" e inserir um novo nome.                      | O nome do projeto é atualizado na barra lateral.                                            |
| **S-03** | Excluir um Projeto           | 1. Clicar nos "..." de um projeto com conversas. <br> 2. Selecionar "Excluir".                                 | O projeto é removido. As conversas que estavam nele agora aparecem como "avulsas".          |
| **S-04** | Mover conversa para Projeto  | 1. Arrastar uma conversa avulsa e soltá-la sobre um projeto.                                                   | A conversa desaparece da lista de avulsas e aparece dentro do projeto.                      |
| **S-05** | Remover conversa de Projeto  | 1. No menu da conversa, selecionar "Mover para..." e depois "Remover do projeto".                             | A conversa sai do projeto e reaparece na lista de conversas avulsas.                        |

---

## 2. Formulário de Feedback Geral do Sistema

**Instruções:** Por favor, preencha as seções abaixo com suas impressões sinceras sobre o uso do Assistente Corporativo Bob. Seu feedback é crucial para a evolução da ferramenta.

---

### **Seção 1: Informações Gerais**

*   **Seu Nome:**
*   **Sua Área/Equipe:**
*   **Data do Feedback:**

### **Seção 2: Avaliação de Usabilidade e Experiência (UX)**

*   **Em uma escala de 1 (Muito Difícil) a 5 (Muito Fácil), quão fácil foi usar a aplicação?**
    *   ( ) 1 ( ) 2 ( ) 3 ( ) 4 ( ) 5

*   **A interface é clara e intuitiva? Há algo que você achou confuso?**
    *   

*   **Como você avalia a organização das conversas com "Projetos" e a funcionalidade de arrastar e soltar?**
    *   

*   **Comentários sobre o design (cores, fontes, layout):**
    *   

### **Seção 3: Avaliação das Funcionalidades e da IA**

*   **Em uma escala de 1 (Pouco Útil) a 5 (Muito Útil), quão úteis foram as respostas da IA para o seu trabalho?**
    *   ( ) 1 ( ) 2 ( ) 3 ( ) 4 ( ) 5

*   **As respostas do Bob foram, em geral, precisas e relevantes?**
    *   

*   **A funcionalidade de análise de arquivos (PDF, Word, Excel) funcionou como esperado? Foi útil?**
    *   

*   **A transcrição de áudio foi precisa? Você encontrou alguma dificuldade ao usar a entrada por voz?**
    *   

*   **Você utilizou as opções de "Regenerar Resposta" e "Feedback (gostei/não gostei)"? Elas foram úteis?**
    *   

### **Seção 4: Performance e Confiança**

*   **Como você avalia a velocidade de resposta da aplicação?**
    *   ( ) Lenta ( ) Aceitável ( ) Rápida

*   **Você encontrou algum erro, travamento ou comportamento inesperado durante o uso? Se sim, por favor, descreva.**
    *   

*   **Você se sentiu seguro ao utilizar a ferramenta, sabendo que ela possui mecanismos de proteção de dados (DLP)?**
    *   

### **Seção 5: Sugestões e Impressões Finais**

*   **Existe alguma funcionalidade que você gostaria de ver na aplicação e que não existe hoje?**
    *   

*   **Qual foi o ponto mais positivo da sua experiência com o Bob?**
    *   

*   **Qual foi o ponto que mais precisa de melhoria?**
    *   

*   **Comentários Finais (qualquer outra observação que queira fazer):**
    *   

---
**Obrigado por sua colaboração!**
