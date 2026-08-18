import type { Metadata } from 'next';
import OrganizationalConsole from './organizational-console';

export const metadata: Metadata = {
  title: 'תמונת מערכת | מתי המתי״א',
  description: 'קונסולה מקומית לניתוח חבילות signal פסבדונימיות וללא טקסט רפלקטיבי, בלי חשיפת הרפלקציה האישית.',
};

export default function OrganizationalPage() {
  return <OrganizationalConsole />;
}
