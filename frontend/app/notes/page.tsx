import AppLayout from '@/components/layout/AppLayout';
import NotesPanel from '@/components/notes/NotesPanel';

export const metadata = {
  title: 'Notes | MYC OS',
};

export default function NotesPage() {
  return (
    <AppLayout>
      <NotesPanel />
    </AppLayout>
  );
}
