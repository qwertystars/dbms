import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "~/client/auth";
import { AppLayout } from "~/client/components/AppLayout";
import { DashboardPage } from "~/client/pages/DashboardPage";
import { DirectoryPage } from "~/client/pages/DirectoryPage";
import { DnaPage } from "~/client/pages/DnaPage";
import { HelpPage } from "~/client/pages/HelpPage";
import { FamiliesPage } from "~/client/pages/FamiliesPage";
import { FamilyPage } from "~/client/pages/FamilyPage";
import { FeedPage } from "~/client/pages/FeedPage";
import { FriendsPage } from "~/client/pages/FriendsPage";
import { HomePage } from "~/client/pages/HomePage";
import { NotFoundPage } from "~/client/pages/NotFoundPage";
import { InvitationPage } from "~/client/pages/InvitationPage";
import { PersonPage } from "~/client/pages/PersonPage";
import { SignInPage } from "~/client/pages/SignInPage";
import { TreePage } from "~/client/pages/TreePage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/invitations/:token" element={<InvitationPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/families" element={<FamiliesPage />} />
        <Route path="/app/families/:familyId" element={<FamilyPage />} />
        <Route path="/app/families/:familyId/tree" element={<TreePage />} />
        <Route path="/app/families/:familyId/feed" element={<FeedPage />} />
        <Route path="/app/families/:familyId/directory" element={<DirectoryPage />} />
        <Route path="/app/families/:familyId/help" element={<HelpPage />} />
        <Route path="/app/families/:familyId/people/:personId" element={<PersonPage />} />
        <Route path="/app/dna" element={<DnaPage />} />
        <Route path="/app/friends" element={<FriendsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
