import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { resetPassword } from "@/services/api";
import { Button, Input, Alert } from "@/components/ui";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Min. 8 caractères");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("Le mot de passe doit contenir une majuscule");
      return;
    }
    if (!/[a-z]/.test(password)) {
      setError("Le mot de passe doit contenir une minuscule");
      return;
    }
    if (!/\d/.test(password)) {
      setError("Le mot de passe doit contenir un chiffre");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    if (!token) {
      setError("Token manquant dans l'URL");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">BetTracker</h1>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Nouveau mot de passe</h2>

          {success ? (
            <Alert variant="success">
              <p className="font-medium mb-1">Mot de passe reinitialise</p>
              <p>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
              <Link to="/login" className="mt-2 inline-block text-blue-600 hover:underline font-medium">Se connecter</Link>
            </Alert>
          ) : (
            <>
              {error && <Alert variant="error" className="mb-4">{error}</Alert>}
              {!token && (
                <Alert variant="warning" className="mb-4">
                  Lien invalide. Verifiez que vous avez copie l'URL complete.
                </Alert>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Nouveau mot de passe"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 caracteres minimum"
                />
                <Input
                  label="Confirmer"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                <Button
                  type="submit"
                  loading={loading}
                  disabled={!token}
                  icon={<KeyRound size={16} />}
                  className="w-full"
                >
                  Reinitialiser
                </Button>
              </form>
            </>
          )}

          <p className="mt-4 text-center text-sm text-slate-500">
            <Link to="/login" className="text-blue-600 hover:underline font-medium">Retour a la connexion</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
