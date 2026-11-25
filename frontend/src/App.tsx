import { Navigate, Route, Routes } from 'react-router-dom';

import { OrganizationArea } from './components/OrganizationArea';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RotaTesoureiro } from './components/RotaTesoureiro';
import { CategoriesPage } from './pages/CategoriesPage';
import { EditTransactionPage } from './pages/EditTransactionPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { NewInflowPage } from './pages/NewInflowPage';
import { NewOutflowPage } from './pages/NewOutflowPage';
import { OrganizationFormPage } from './pages/OrganizationFormPage';
import { PublicLinkManagementPage } from './pages/PublicLinkManagementPage';
import { PublicTransparencyPage } from './pages/PublicTransparencyPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { StatementPage } from './pages/StatementPage';
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { TransactionsListPage } from './pages/TransactionsListPage';
import { UserEditPage } from './pages/UserEditPage';
import { UserRegistrationPage } from './pages/UserRegistrationPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/transparencia/:link" element={<PublicTransparencyPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/lancamentos" element={<TransactionsListPage />} />
        <Route path="/organizacao/nova" element={<OrganizationFormPage modo="criar" />} />

        <Route element={<RotaTesoureiro />}>
          <Route path="/lancamentos/entrada" element={<NewInflowPage />} />
          <Route path="/lancamentos/saida" element={<NewOutflowPage />} />
          <Route path="/lancamentos/:id/editar" element={<EditTransactionPage />} />
        </Route>

        <Route path="/lancamentos/:id" element={<TransactionDetailPage />} />
        <Route path="/extrato" element={<StatementPage />} />
        {/* Resumo mensal e relatorio por categoria viraram a visao Resumo do extrato. */}
        <Route path="/resumo" element={<Navigate to="/extrato" replace />} />
        <Route path="/relatorios/categorias" element={<Navigate to="/extrato" replace />} />

        <Route path="/organizacao" element={<OrganizationArea />}>
          <Route index element={<Navigate to="membros" replace />} />
          <Route path="membros" element={<MembersPage />} />
          <Route path="categorias" element={<CategoriesPage />} />

          <Route element={<RotaTesoureiro />}>
            <Route path="membros/novo" element={<UserRegistrationPage />} />
            <Route path="membros/:id/editar" element={<UserEditPage />} />
            <Route path="editar" element={<OrganizationFormPage modo="editar" />} />
            <Route path="link-publico" element={<PublicLinkManagementPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/lancamentos" replace />} />
      <Route path="*" element={<Navigate to="/lancamentos" replace />} />
    </Routes>
  );
}
