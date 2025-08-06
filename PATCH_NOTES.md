# Notas de Atualização - Pós-versão 8b3dfd1

Esta atualização foca em corrigir instabilidades críticas do servidor, introduzir novas funcionalidades de gerenciamento de conteúdo e aprimorar a experiência do usuário na interface de chat.

---

### Novas Funcionalidades ✨

*   **Painel de Conteúdo Dinâmico**:
    *   Foi adicionada uma nova guia **"Conteúdo"** ao Painel Administrativo.
    *   Administradores agora podem editar e salvar a mensagem de saudação do robô "Bob" diretamente pela interface, sem precisar de alterações no código. A mensagem é armazenada de forma persistente no Firestore.

*   **Saudação do Robô Interativa**:
    *   O ícone do robô "Bob" na tela de chat agora exibe a saudação dinâmica configurada no painel administrativo dentro de um balão de diálogo (popover) ao ser clicado, buscando sempre a versão mais recente.

---

### Correções de Bugs 🐛

*   **Estabilização do Servidor de Desenvolvimento**:
    *   Corrigidos múltiplos problemas que causavam o desligamento inesperado (`Preview shutdown unexpectedly`) e reinicializações constantes do servidor Next.js. A instabilidade estava ligada a erros sutis na renderização de componentes e na busca de dados no painel administrativo e na página de chat.

*   **Correção no Salvamento de Conteúdo**:
    *   Resolvido um bug no Painel Administrativo onde, ao salvar a mensagem de saudação, uma notificação de erro (`Cannot read properties of undefined (reading 'error')`) era exibida incorretamente. A lógica de verificação de resposta da função foi ajustada para garantir que o status de sucesso seja tratado corretamente.

---

### Melhorias e Ajustes 🎨

*   **Comportamento do Ícone do Robô**:
    *   O ícone do robô agora desaparece suavemente com um efeito de "fade out" assim que uma conversa é iniciada, limpando a interface para o diálogo.

*   **Consistência Visual**:
    *   O botão "Pesquisar na Web", que aparece quando uma busca na base de dados interna falha, foi reestilizado para usar a cor secundária (cinza), alinhando-se melhor com o design geral da aplicação.
