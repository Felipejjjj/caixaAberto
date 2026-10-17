import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/ProtectedRoute';
import { RotaTesoureiro } from './components/RotaTesoureiro';
import { CategoriesPage } from './pages/CategoriesPage';
import { CategoryReportPage } from './pages/CategoryReportPage';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { MonthlySummaryPage } from './pages/MonthlySummaryPage';
import { NewInflowPage } from './pages/NewInflowPage';
import { NewOutflowPage } from './pages/NewOutflowPage';
import { OrganizationFormPage } from './pages/OrganizationFormPage';
import { PublicLinkManagementPage } from './pages/PublicLinkManagementPage';
import { PublicTransparencyPage } from './pages/PublicTransparencyPage';
import { StatementPage } from './pages/StatementPage';
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { TransactionsListPage } from './pages/TransactionsListPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/transparencia/:link" element={<PublicTransparencyPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/lancamentos" element={<TransactionsListPage />} />
        <Route path="/organizacao/nova" element={<OrganizationFormPage modo="criar" />} />

        <Route element={<RotaTesoureiro />}>
          <Route path="/lancamentos/entrada" element={<NewInflowPage />} />
          <Route path="/lancamentos/saida" element={<NewOutflowPage />} />
          <Route path="/organizacao/editar" element={<OrganizationFormPage modo="editar" />} />
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
