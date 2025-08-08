# Guia de Implementação: Fluxo de Aceitação Obrigatória de Termos de Uso com Firebase

Este documento detalha a arquitetura e a implementação de um sistema que força os usuários a aceitarem os Termos de Uso antes de poderem acessar o conteúdo principal de uma aplicação. A solução utiliza React (Next.js), Firebase Authentication e Firestore.

---

## 1. Visão Geral e Arquitetura

O objetivo é garantir que nenhum usuário, novo ou existente, possa utilizar a aplicação sem antes ter um registro de que aceitou os termos. Para isso, usamos o **Firestore** como nossa "fonte da verdade" para rastrear o status de aceitação de cada usuário.

### Componentes Principais:
1.  **Firebase Authentication:** Gerencia o login do usuário e fornece um identificador único (`uid`).
2.  **Firestore:** Armazena o perfil de cada usuário, incluindo um campo booleano (`termsAccepted`) para registrar a aceitação.
3.  **Frontend (React/Next.js):**
    *   **Contexto de Autenticação (`AuthProvider`):** Monitora o estado de login do usuário.
    *   **Página Principal (`ChatPage.tsx`):** Contém a lógica para verificar o status dos termos e exibir um diálogo de bloqueio.
    *   **Diálogo Modal (`AlertDialog`):** Apresenta os termos e a caixa de seleção para o usuário.

### Fluxo Lógico:
1.  Usuário faz login com o Firebase Authentication.
2.  A aplicação detecta o login e obtém o `uid` do usuário.
3.  **Verificação no Firestore:** A aplicação busca um documento na coleção `users` com o `uid` do usuário (`/users/{uid}`).
4.  **Decisão:**
    *   **Usuário Novo (Documento não existe):**
        *   Cria um novo documento para o usuário em `/users/{uid}`.
        *   Define o campo `termsAccepted` como `false`.
        *   Exibe o diálogo de Termos de Uso, bloqueando o acesso à interface principal.
    *   **Usuário Existente (Documento existe):**
        *   Lê o valor do campo `termsAccepted`.
        *   Se for `false`, exibe o diálogo de Termos de Uso.
        *   Se for `true`, permite o acesso normal à aplicação.
5.  **Aceitação do Usuário:**
    *   O usuário marca a caixa de seleção "Eu aceito os termos".
    *   Clica no botão "Continuar".
    *   A aplicação atualiza o campo `termsAccepted` para `true` no Firestore.
    *   O diálogo é fechado e o acesso à aplicação é liberado.

---

## 2. Implementação Passo a Passo

### Passo 1: Estrutura do Firestore

Garanta que suas Regras de Segurança do Firestore (`firestore.rules`) permitam que um usuário autenticado crie seu próprio documento e o atualize.

```javascript
// firestore.rules
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Permite que um usuário leia e escreva apenas em seu próprio documento na coleção 'users'.
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    // ... outras regras
  }
}
```

### Passo 2: Lógica de Verificação no Frontend

No componente principal da sua aplicação (neste projeto, `src/app/chat/ChatPage.tsx`), utilize o hook `useEffect` para acionar a verificação assim que o status de autenticação do usuário for conhecido.

```typescript
// Em src/app/chat/ChatPage.tsx

// Hooks de estado para controlar o fluxo
const [showTermsDialog, setShowTermsDialog] = useState(false);
const [termsAccepted, setTermsAccepted] = useState(false); // Controla o checkbox
const [isCheckingTerms, setIsCheckingTerms] = useState(true); // Para exibir um loading

const { user, loading: authLoading } = useAuth(); // Vem do AuthProvider

useEffect(() => {
  if (authLoading) {
    return; // Aguarda o Firebase Auth inicializar
  }
  if (!user) {
    router.push('/login'); // Se não há usuário, redireciona para o login
    return;
  }

  // Função assíncrona para verificar e/ou criar o usuário no Firestore
  const checkTermsAndCreateUser = async () => {
    setIsCheckingTerms(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        // 1. Usuário é novo: crie o documento com termsAccepted: false
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          createdAt: serverTimestamp(),
          termsAccepted: false
        });
        // 2. Exiba o diálogo
        setShowTermsDialog(true);
      } else {
        // 3. Usuário existe: verifique o campo
        if (userDocSnap.data().termsAccepted === true) {
          // Já aceitou, carregue a aplicação
          fetchApplicationData();
        } else {
          // Ainda não aceitou, exiba o diálogo
          setShowTermsDialog(true);
        }
      }
    } catch (err: any) {
      // Trate erros (ex: falha de permissão)
      toast({
        variant: 'destructive',
        title: 'Erro ao verificar termos',
        description: err.message,
      });
      await handleSignOut(); // Desloga o usuário em caso de erro
    } finally {
      setIsCheckingTerms(false);
    }
  };
  
  checkTermsAndCreateUser();
}, [user, authLoading, router]);
```

### Passo 3: Diálogo de Termos de Uso

Use um componente de diálogo modal (neste projeto, o `AlertDialog` de ShadCN) que bloqueie a interação com o resto da UI.

```typescript
// Em src/app/chat/ChatPage.tsx

// Função para lidar com o aceite
const handleAcceptTerms = async () => {
  if (!user) return;
  try {
    const userDocRef = doc(db, 'users', user.uid);
    // Atualiza o campo no Firestore
    await updateDoc(userDocRef, { termsAccepted: true });
    setShowTermsDialog(false); // Fecha o diálogo
    fetchApplicationData(); // Carrega os dados da aplicação
  } catch (error: any) {
    toast({
      variant: "destructive",
      title: "Erro",
      description: `Não foi possível salvar sua preferência: ${error.message}`
    });
    await handleSignOut();
  }
};

// Função para lidar com a recusa
const handleDeclineTerms = async () => {
  setShowTermsDialog(false);
  await handleSignOut(); // Desloga o usuário se ele recusar
};

// Renderização do JSX
return (
  <>
    {/* Loading inicial enquanto verifica */}
    {(authLoading || isCheckingTerms) && <LoadingSpinner />}

    <AlertDialog open={showTermsDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Termos de Uso e Política de Privacidade</AlertDialogTitle>
          <AlertDialogDescription>
            {/* O texto completo dos seus termos aqui */}
            Para continuar, você deve concordar com os Termos de Uso...
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center space-x-2 my-4">
          <Checkbox 
            id="terms" 
            checked={termsAccepted} 
            onCheckedChange={(checked) => setTermsAccepted(!!checked)} 
          />
          <Label htmlFor="terms">Eu li e aceito os Termos de Uso</Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDeclineTerms}>Recusar e Sair</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleAcceptTerms} 
            disabled={!termsAccepted} // Botão só é clicável após marcar o checkbox
          >
            Continuar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* O resto da sua aplicação */}
  </>
);
```

---

## 3. Conclusão

Esta abordagem cria um fluxo seguro e robusto para garantir a conformidade com os Termos de Uso. Ao usar o Firestore como a única fonte da verdade, você tem um registro auditável da aceitação de cada usuário, e a lógica do lado do cliente garante que o acesso seja bloqueado até que essa condição seja satisfeita.