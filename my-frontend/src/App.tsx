import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';
import { GuestOnly, RequireAuth } from '@/components/AuthGuard';
import LandingPage from '@/pages/LandingPage';
import AuthPage from '@/pages/AuthPage';
import ProjectGallery from '@/pages/ProjectGallery';
import GraphEditor from '@/pages/GraphEditor';
import AssistantPage from '@/pages/AssistantPage';
import GraphRagPage from '@/pages/GraphRagPage';
import KnowledgeClickEffect from '@/components/KnowledgeClickEffect';
import { shouldShowKnowledgeClickEffect } from '@/components/KnowledgeClickEffect/routePolicy';
import './App.css';

function AppRoutes() {
  const location = useLocation();

  return (
    <div className="app-container">
      {shouldShowKnowledgeClickEffect(location.pathname) && (
        <KnowledgeClickEffect />
      )}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/login"
          element={
            <GuestOnly>
              <AuthPage />
            </GuestOnly>
          }
        />
        <Route
          path="/projects"
          element={
            <RequireAuth>
              <ProjectGallery />
            </RequireAuth>
          }
        />
        <Route
          path="/assistant"
          element={
            <RequireAuth>
              <AssistantPage />
            </RequireAuth>
          }
        />
        <Route
          path="/editor/:projectId"
          element={
            <RequireAuth>
              <GraphEditor />
            </RequireAuth>
          }
        />
        <Route
          path="/graphrag"
          element={
            <RequireAuth>
              <GraphRagPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
