import { Navbar } from "./navbar";
import { Sidebar } from "./sidebar";
import { CreateProjectModal } from "@/features/projects/components/create-project-modal";

interface DashboardLayoutProps {
  children: React.ReactNode;
};

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  return (
    <div className="bg-muted h-full">
      <CreateProjectModal />
      <Sidebar />
      <div className="lg:pl-[300px] flex flex-col h-full">
        <Navbar />
        <main className="bg-white flex-1 overflow-auto p-8 lg:rounded-tl-2xl">
          {children}
        </main>
      </div>
    </div>
  );
};
 
export default DashboardLayout;
