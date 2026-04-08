import { HomeLayout } from '@/modules/home/ui/layouts/home-layout';
interface HomeLayoutProps {
  children: React.ReactNode;
}
//TODO: Confirm is this is needed or not.
export const dynamic = 'force-dynamic';

const Layout = ({ children }: HomeLayoutProps) => {
  return <HomeLayout>{children}</HomeLayout>;
};

export default Layout;
