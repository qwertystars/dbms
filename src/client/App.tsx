import { AccountPage } from "~/client/pages/AccountPage";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { EventsPage } from "~/client/pages/EventsPage";
import { PeoplePage } from "~/client/pages/PeoplePage";
import { RequireAuth } from "~/client/auth";
import { AppLayout } from "~/client/components/AppLayout";
import { DashboardPage } from "~/client/pages/DashboardPage";
import { FamiliesPage } from "~/client/pages/FamiliesPage";
import { FamilyPage } from "~/client/pages/FamilyPage";
import { FeedPage } from "~/client/pages/FeedPage";
import { FriendsPage } from "~/client/pages/FriendsPage";
import { HomePage } from "~/client/pages/HomePage";
import { NotFoundPage } from "~/client/pages/NotFoundPage";
import { InvitationPage } from "~/client/pages/InvitationPage";
import { PersonPage } from "~/client/pages/PersonPage";
import { SignInPage, SignUpPage } from "~/client/pages/SignInPage";
import { TreePage } from "~/client/pages/TreePage";

function FeedRedirect() {
  const { familyId } = useParams<{ familyId: string }>();
  return <Navigate to={`/app/families/${familyId}/memories`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route path="/invitations/:token" element={<InvitationPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/app/account" element={<AccountPage />} />
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/families" element={<FamiliesPage />} />
        <Route path="/app/families/:familyId" element={<FamilyPage />} />
        <Route path="/app/families/:familyId/tree" element={<TreePage />} />
        <Route path="/app/families/:familyId/memories" element={<FeedPage />} />
        <Route path="/app/families/:familyId/feed" element={<FeedRedirect />} />
        <Route path="/app/families/:familyId/people" element={<PeoplePage />} />
        <Route path="/app/families/:familyId/events" element={<EventsPage />} />
        <Route path="/app/families/:familyId/people/:personId" element={<PersonPage />} />
        <Route path="/app/friends" element={<FriendsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
