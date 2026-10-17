import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute';
import { RotaTesoureiro } from './components/RotaTesoureiro';
import { CategoriesPage } from './pages/CategoriesPage';
import { CategoryReportPage } from './pages/CategoryReportPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { MonthlySummaryPage } from './pages/MonthlySummaryPage';
import { NewInflowPage } from './pages/NewInflowPage';
import { NewOutflowPage } from './pages/NewOutflowPage';
import { PublicLinkManagementPage } from './pages/PublicLinkManagementPage';
import { PublicTransparencyPage } from './pages/PublicTransparencyPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { StatementPage } from './pages/StatementPage';
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { TransactionsListPage } from './pages/TransactionsListPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route path="/transparencia/:link" element={<PublicTransparencyPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/lancamentos" element={<TransactionsListPage />} />

        <Route element={<RotaTesoureiro />}>
          <Route path="/lancamentos/entrada" element={<NewInflowPage />} />
          <Route path="/lancamentos/saida" element={<NewOutflowPage />} />
          <Route path="/organizacao/link-publico" element={<PublicLinkManagementPage />} />
        </Route>

        <Route path="/lancamentos/:id" element={<TransactionDetailPage />} />
        <Route path="/resumo" element={<MonthlySummaryPage />} />
        <Route path="/extrato" element={<StatementPage />} />
        <Route path="/relatorios/categorias" element={<CategoryReportPage />} />
        <Route path="/organizacao/membros" element={<MembersPage />} />
        <Route path="/organizacao/categorias" element={<CategoriesPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/lancamentos" replace />} />
      <Route path="*" element={<Navigate to="/lancamentos" replace />} />
    </Routes>
  );
}
