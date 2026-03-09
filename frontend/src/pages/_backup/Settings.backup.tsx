import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Lock, Trash2, AlertTriangle, User, Shield, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { changePassword } from "@/services/api";
import { Button, Input, Card, Alert, PageHeader } from "@/components/ui";

type Tab = "profile" | "security" | "danger";

export default function Settings() {
  const { user, updateProfile, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // Profile
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [profileMsg, setProfileMsg] = useState("");
  const [profileErr, setProfileErr] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Password
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErr("");
    setProfileMsg("");
    setProfileLoading(true);
    try {
      const updates: { display_name?: string; email?: string } = {};
      if (displayName !== user?.display_name) updates.display_name = displayName;
      if (email !== user?.email) updates.email = email;
      if (Object.keys(updates).length === 0) {
        setProfileMsg("Aucune modification");
        setProfileLoading(false);
        return;
      }
      await updateProfile(updates);
      setProfileMsg("Profil mis a jour");
    } catch (err: unknown) {
      setProfileErr(err instanceof Error ? err.message : "Erreur");
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePwdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErr("");
    setPwdMsg("");
    if (newPwd.length < 8) {
      setPwdErr("Le nouveau mot de passe doit contenir au moins 8 caracteres");
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdErr("Les mots de passe ne correspondent pas");
      return;
    }
    setPwdLoading(true);
    try {
      await changePassword({ current_password: currentPwd, new_password: newPwd });
      setPwdMsg("Mot de passe modifie avec succes");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (err: unknown) {
      setPwdErr(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPwdLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await deleteAccount();
      navigate("/login");
    } catch {
      setDeleteLoading(false);
    }
  };

  const initials = (user?.display_name || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: "profile", label: "Profil", icon: User },
    { id: "security", label: "Securite", icon: Shield },
    { id: "danger", label: "Zone danger", icon: AlertTriangle },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Parametres" description="Gerez votre compte et vos preferences" />

      {/* Profile header card */}
      <Card className="mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 truncate">{user?.display_name}</h2>
            <p className="text-sm text-slate-500 truncate">{user?.email}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
              {user?.subscription_tier || "Free"}
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        {/* Side nav */}
        <nav className="space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === id
                  ? "bg-blue-50 text-blue-700"
                  : id === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon size={16} />
              {label}
              <ChevronRight size={14} className="ml-auto opacity-40" />
            </button>
          ))}
        </nav>

        {/* Content */}
        <div>
          {activeTab === "profile" && (
            <Card padding="lg">
              <h3 className="text-base font-semibold text-slate-900 mb-4">Informations du profil</h3>

              {profileMsg && <Alert variant="success" className="mb-4">{profileMsg}</Alert>}
              {profileErr && <Alert variant="error" className="mb-4">{profileErr}</Alert>}

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Nom d'affichage"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={100}
                  />
                  <Input
                    label="Adresse email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" loading={profileLoading} icon={<Save size={14} />}>
                    Enregistrer
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {activeTab === "security" && (
            <Card padding="lg">
              <h3 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Lock size={16} /> Modifier le mot de passe
              </h3>

              {pwdMsg && <Alert variant="success" className="mb-4">{pwdMsg}</Alert>}
              {pwdErr && <Alert variant="error" className="mb-4">{pwdErr}</Alert>}

              <form onSubmit={handlePwdSubmit} className="space-y-4 max-w-md">
                <Input
                  label="Mot de passe actuel"
                  type="password"
                  required
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                />
                <Input
                  label="Nouveau mot de passe"
                  type="password"
                  required
                  minLength={8}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="8 caracteres minimum"
                />
                <Input
                  label="Confirmer le nouveau mot de passe"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button type="submit" loading={pwdLoading} icon={<Lock size={14} />}>
                    Modifier le mot de passe
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {activeTab === "danger" && (
            <Card padding="lg" danger>
              <h3 className="text-base font-semibold text-red-700 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} /> Supprimer le compte
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                La suppression du compte est irreversible. Vos donnees seront conservees mais votre acces sera desactive.
              </p>

              {!showDeleteConfirm ? (
                <Button
                  variant="danger"
                  onClick={() => setShowDeleteConfirm(true)}
                  icon={<Trash2 size={14} />}
                >
                  Supprimer mon compte
                </Button>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    loading={deleteLoading}
                    icon={<Trash2 size={14} />}
                  >
                    Confirmer la suppression
                  </Button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
