import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "../components/layout/ProtectedRoute";
import AppLayout from "../components/layout/AppLayout";
import Login from "../pages/auth/Login";

import AdminDashboard from "../pages/admin/Dashboard";
import ManageUsers from "../pages/admin/ManageUsers";
import ManageClasses from "../pages/admin/ManageClasses";
import Settings from "../pages/admin/Settings";
import AdminReports from "../pages/admin/Reports";
import LoginLog from "../pages/admin/LoginLog";
import PrintCards from "../pages/admin/PrintCards";

import TeacherDashboard from "../pages/teacher/Dashboard";
import QuestionBank from "../pages/teacher/QuestionBank";
import ExamList from "../pages/teacher/ExamList";
import CreateExam from "../pages/teacher/CreateExam";
import MonitorExam from "../pages/teacher/MonitorExam";
import GradeEssay from "../pages/teacher/GradeEssay";
import TeacherResults from "../pages/teacher/Results";

import StudentDashboard from "../pages/student/Dashboard";
import ExamSchedule from "../pages/student/ExamSchedule";
import TakeExam from "../pages/student/TakeExam";
import StudentResults from "../pages/student/Results";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
        <Route element={<AppLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<ManageUsers />} />
          <Route path="/admin/classes" element={<ManageClasses />} />
          <Route path="/admin/settings" element={<Settings />} />
          <Route path="/admin/reports" element={<AdminReports />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["admin", "teacher"]} />}>
        <Route element={<AppLayout />}>
          <Route path="/admin/log" element={<LoginLog />} />
          <Route path="/admin/cards" element={<PrintCards />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["teacher"]} />}>
        <Route element={<AppLayout />}>
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/teacher/bank" element={<QuestionBank />} />
          <Route path="/teacher/exams" element={<ExamList />} />
          <Route path="/teacher/exams/new" element={<CreateExam />} />
          <Route path="/teacher/exams/:examId/edit" element={<CreateExam />} />
          <Route path="/teacher/exams/:examId/monitor" element={<MonitorExam />} />
          <Route path="/teacher/grade" element={<GradeEssay />} />
          <Route path="/teacher/results" element={<TeacherResults />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={["student"]} />}>
        <Route element={<AppLayout />}>
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/student/schedule" element={<ExamSchedule />} />
          <Route path="/student/results" element={<StudentResults />} />
        </Route>
        {/* Halaman ujian: layar penuh tanpa sidebar/navbar */}
        <Route path="/student/exam/:examId" element={<TakeExam />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
