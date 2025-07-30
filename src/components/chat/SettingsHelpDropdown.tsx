
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { HelpCircle, LogIn, LogOut, Moon, Settings, Sun, Shield } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthProvider';
import { ADMIN_UID } from '@/app/actions';

interface SettingsHelpDropdownProps {
  isAuthenticated: boolean;
  handleSignOut: () => void;
  onOpenFaqDialog: () => void;
}


export function SettingsHelpDropdown({
  isAuthenticated,
  handleSignOut,
  onOpenFaqDialog,
}: SettingsHelpDropdownProps) {
  const { setTheme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const isUserAdmin = user?.uid === ADMIN_UID;

  return (
    <DropdownMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip="Configurações e Ajuda" variant="ghost" className="h-9 w-full justify-start !bg-transparent text-sidebar-foreground hover:!bg-sidebar-accent hover:!text-sidebar-accent-foreground">
          <DropdownMenuTrigger>
            <Settings className="size-5" />
            <SidebarMenuButton.Text>Configurações e Ajuda</SidebarMenuButton.Text>
          </DropdownMenuTrigger>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          <span>Claro</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          <span>Escuro</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Settings className="mr-2 h-4 w-4" />
          <span>Sistema</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOpenFaqDialog}>
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>Guias e FAQ</span>
        </DropdownMenuItem>
        
        {isUserAdmin && (
            <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/admin')}>
                    <Shield className="mr-2 h-4 w-4" />
                    <span>Painel de Admin</span>
                </DropdownMenuItem>
            </>
        )}

        <DropdownMenuSeparator />
        {isAuthenticated ? (
          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            <span>Sair</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => router.push('/')}>
            <LogIn className="mr-2 h-4 w-4" />
            <span>Ir para Login</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
