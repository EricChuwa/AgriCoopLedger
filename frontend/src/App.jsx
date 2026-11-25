import { Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import AuthLayout from "./components/AuthLayout.jsx";
import TitleManager from "./components/TitleManager.jsx";
import { GuestOnly, RequireAuth, RequireRole } from "./components/RouteGuards.jsx";
import Account from "./pages/Account.jsx";
import AddFarmer from "./pages/AddFarmer.jsx";
import AddStaff from "./pages/AddStaff.jsx";
import AuditLog from "./pages/AuditLog.jsx";
import BatchDetail from "./pages/BatchDetail.jsx";
import Batches from "./pages/Batches.jsx";
import NewBatch from "./pages/NewBatch.jsx";
import Corrections from "./pages/Corrections.jsx";
import Sales from "./pages/Sales.jsx";
import Disputes from "./pages/Disputes.jsx";
import Buy from "./pages/Buy.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Deliveries from "./pages/Deliveries.jsx";
import EditFarmer from "./pages/EditFarmer.jsx";
import FarmerDetail from "./pages/FarmerDetail.jsx";
import Farmers from "./pages/Farmers.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import NotFound from "./pages/NotFound.jsx";
import Payments from "./pages/Payments.jsx";
import Produce from "./pages/Produce.jsx";
import RecordDelivery from "./pages/RecordDelivery.jsx";
import RecordPayment from "./pages/RecordPayment.jsx";
import Receipt from "./pages/Receipt.jsx";
import Reports from "./pages/Reports.jsx";
import Settings from "./pages/Settings.jsx";
import Staff from "./pages/Staff.jsx";
import Signup from "./pages/Signup.jsx";

export default function App() {
  return (
    <>
    <TitleManager />
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/buy" element={<Buy />} />

      <Route element={<GuestOnly />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/produce" element={<Produce />} />
          <Route path="/farmers" element={<Farmers />} />
          <Route path="/farmers/:id" element={<FarmerDetail />} />
          <Route path="/deliveries" element={<Deliveries />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/disputes" element={<Disputes />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/receipts/:kind/:id" element={<Receipt />} />

          <Route element={<RequireRole roles={["manager", "clerk"]} />}>
            <Route path="/farmers/new" element={<AddFarmer />} />
            <Route path="/farmers/:id/edit" element={<EditFarmer />} />
            <Route path="/corrections" element={<Corrections />} />
          </Route>
          <Route element={<RequireRole roles={["clerk"]} />}>
            <Route path="/deliveries/new" element={<RecordDelivery />} />
          </Route>
          <Route element={<RequireRole roles={["payment_officer"]} />}>
            <Route path="/payments/new" element={<RecordPayment />} />
          </Route>
          <Route element={<RequireRole roles={["manager", "payment_officer"]} />}>
            <Route path="/reports" element={<Reports />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/batches/:id" element={<BatchDetail />} />
          </Route>
          <Route element={<RequireRole roles={["payment_officer"]} />}>
            <Route path="/batches/new" element={<NewBatch />} />
          </Route>
          <Route element={<RequireRole roles={["manager"]} />}>
            <Route path="/staff" element={<Staff />} />
            <Route path="/staff/new" element={<AddStaff />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="/account" element={<Account />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
}
