'use client';

import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarTrigger,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  FolderPlus,
  FilePenLine,
  HelpCircle,
  Settings,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();

  const getInitials = (name?: string | null) => {
    if (!name) return <UserIcon className="h-4 w-4" />;
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <>
      <Sidebar variant="sidebar" collapsible="icon" className="border-r bg-background">
        {user && (
          <>
            <SidebarHeader className="p-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} />
                  <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col truncate">
                  <p className="truncate text-sm font-semibold">{user.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
            </SidebarHeader>

            <SidebarContent className="flex flex-col p-2">
              <div className="space-y-2">
                <div>
                  <Button variant="secondary" className="h-10 w-full justify-start gap-2">
                    <FolderPlus />
                    <span className="truncate">Novo Projeto</span>
                  </Button>
                  <p className="p-2 text-xs text-muted-foreground">Nenhum projeto criado.</p>
                </div>
                
                <SidebarSeparator />

                <div>
                  <Button variant="secondary" className="h-10 w-full justify-start gap-2">
                    <FilePenLine />
                    <span className="truncate">Nova conversa</span>
                  </Button>
                  <p className="p-2 text-xs text-muted-foreground">Nenhuma conversa recente.</p>
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center">
                  <p className="p-4 text-center text-xs text-muted-foreground">Nenhuma conversa ou projeto ainda.<br />Crie um novo projeto ou uma nova conversa!</p>
              </div>
            </SidebarContent>

            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton className="justify-start">
                    <HelpCircle />
                    <span className="truncate">Guias e FAQ</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="justify-start">
                    <Settings />
                    <span className="truncate">Configurações</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={signOut} className="justify-start">
                    <LogOut />
                    <span className="truncate">Sair</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </>
        )}
      </Sidebar>

      <SidebarInset className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center border-b bg-background/95 px-6 backdrop-blur-sm">
          <SidebarTrigger />
          <h1 className="ml-4 text-lg font-bold">DataVisor</h1>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </>
  );
}