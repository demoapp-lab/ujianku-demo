import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import AppRoutes from "./routes/AppRoutes";
import { useSchoolFavicon } from "./hooks/useSchoolFavicon";

function App() {
  useSchoolFavicon();
  return (
    <AuthProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              className:
                "!card !rounded-sm !border-l-4 !border-l-brass !px-4 !py-3 !shadow-none !text-sm",
              success: {
                className: "!border-l-ink",
                iconTheme: { primary: "#0C2E24", secondary: "#F4F5F1" },
              },
              error: {
                className: "!border-l-signal",
                iconTheme: { primary: "#B3261E", secondary: "#FFFFFF" },
              },
            }}
          />
        </BrowserRouter>
      </ConfirmProvider>
    </AuthProvider>
  );
}

export default App;
