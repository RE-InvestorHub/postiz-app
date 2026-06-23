import { Studio } from '@gitroom/frontend/components/studio/studio.component';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} Studio`,
  description: '',
};

export default async function Page() {
  return <Studio />;
}
