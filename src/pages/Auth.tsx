import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Auth page is no longer needed - redirect to home
const Auth = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to home since we're in local mode without authentication
    navigate("/", { replace: true });
  }, [navigate]);

  return null;
};

export default Auth;
