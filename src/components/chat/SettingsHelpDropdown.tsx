
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
import { HelpCircle, LogIn, LogOut, Moon, Settings, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';

interface SettingsHelpDropdownProps {
  isAuthenticated: boolean;
  handleSignOut: () => void;
}

export function SettingsHelpDropdown({
  isAuthenticated,
  handleSignOut,
}: SettingsHelpDropdownProps) {
  const { setTheme } = useTheme();
  const router = useRouter();

  return (
    <DropdownMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip="Configurações" variant="ghost" size="sm">
          <DropdownMenuTrigger>
            <Settings className="size-5" />
            <SidebarMenuButton.Text>Configurações</SidebarMenuButton.Text>
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
        <DropdownMenuItem onClick={() => {}}>
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>Guias e FAQ</span>
        </DropdownMenuItem>
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
