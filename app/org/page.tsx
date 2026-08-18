import type { Metadata } from 'next';
import OrganizationalConsole from './organizational-console';

export const metadata: Metadata = {
  title: 'תמונת מערכת | מתי המתי״א',
  description: 'קונסולה מקומית לניתוח חבילות signal אנונימיות של MATI בלי חשיפת רפלקציה אישית.',
};

export default function OrganizationalPage() {
  return <OrganizationalConsole />;
}
