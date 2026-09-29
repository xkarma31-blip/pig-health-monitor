/**
 * Layout — Shell wrapper with Sidebar + routed content area.
 *
 * Uses react-router-dom `Outlet` to render the active page.
 * The sidebar sits on the left; content fills the remaining space.
 */
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

/** Top-level layout: sidebar + scrollable main content. */
export function Layout() {
  return (
    <div className="flex min-h-screen bg-[#090d16] text-gray-300">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 lg:pl-6">
        <Outlet />
      </main>
    </div>
  );
}
