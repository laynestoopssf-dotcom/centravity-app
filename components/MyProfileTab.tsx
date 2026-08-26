"use client";

import React, { useRef, useState } from "react";
import { Camera, Loader2, Save, KeyRound, User as UserIcon } from "lucide-react";
import { supabase } from "../utils/supabase";
import ProfileAvatar from "./ui/ProfileAvatar";

// =============================================================================
// Self-service "My Profile" - the one settings surface every role gets, unlike
// the rest of Settings (owner/admin-only via manage_settings). Deliberately
// narrow in scope: first/last name + avatar + password. Everything else about
// a team member (comp plan, targets, role, vacation) stays owner-managed via
// Settings -> Team Management, same as before this tab existed - see that
// section's edit modal in components/SettingsTab.tsx.
//
// Avatar upload writes straight to the `avatars` Storage bucket from the
// browser (anon-key client) - see supabase/migrations/20260826010000_add_profile_avatars.sql
// for the bucket + per-user-folder RLS policies that make this safe (a user
// can only write inside their own `{user_id}/` folder). The bucket is public,
// so the resulting URL is usable immediately with no signed-URL dance.
// =============================================================================

interface ProfileLite {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
}

export default function MyProfileTab({
  profile,
  onProfileSaved,
  showToast,
}: {
  profile: ProfileLite;
  onProfileSaved: (updated: Partial<ProfileLite>) => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [firstName, setFirstName] = useState(profile.first_name || "");
  const [lastName, setLastName] = useState(profile.last_name || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(profile.avatar_url);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const fullName = `${firstName} ${lastName}`.trim();
  const nameDirty = firstName !== (profile.first_name || "") || lastName !== (profile.last_name || "");

  const handleAvatarPick = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file (PNG, JPG, or WebP).", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image is too large - please choose one under 5MB.", "error");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      // Fixed filename (not a random one) so re-uploading always overwrites the same
      // object instead of orphaning old photos in Storage forever - `upsert: true`
      // makes that safe.
      const path = `${profile.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        cacheControl: "3600",
      });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so the new photo shows immediately everywhere it's already rendered -
      // otherwise the browser (and any CDN in front of Storage) would keep serving the old
      // cached image at the exact same URL after an overwrite.
      const bustedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: bustedUrl })
        .eq("id", profile.id);
      if (updateError) throw updateError;

      setAvatarUrl(bustedUrl);
      onProfileSaved({ avatar_url: bustedUrl });
      showToast("Profile photo updated!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to upload photo.", "error");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveName = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      showToast("First and last name can't be blank.", "error");
      return;
    }
    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: firstName.trim(), last_name: lastName.trim() })
        .eq("id", profile.id);
      if (error) throw error;
      onProfileSaved({ first_name: firstName.trim(), last_name: lastName.trim() });
      showToast("Name updated!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update name.", "error");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("Passwords don't match.", "error");
      return;
    }
    setIsSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password updated!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update password.", "error");
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserIcon className="text-blue-600" size={24} /> My Profile
        </h2>
        <p className="text-sm text-gray-500 mt-1">Manage your name, photo, and password. Targets, comp plan, and role are managed by your agency owner.</p>
      </div>

      {/* PHOTO */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-gray-900 mb-4">Profile Photo</h3>
        <div className="flex items-center gap-5">
          <ProfileAvatar src={avatarUrl} name={fullName || "?"} size="xl" />
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleAvatarPick(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={isUploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
            >
              {isUploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              {isUploadingAvatar ? "Uploading..." : "Upload New Photo"}
            </button>
            <p className="text-[11px] text-gray-400 mt-2">PNG, JPG, or WebP. Max 5MB. Shows up on the Scoreboard, Ledger, and team roster.</p>
          </div>
        </div>
      </div>

      {/* NAME */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-gray-900 mb-4">Name</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-gray-900"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={!nameDirty || isSavingName}
          onClick={handleSaveName}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSavingName ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Name
        </button>
      </div>

      {/* PASSWORD */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><KeyRound size={18} className="text-gray-400" /> Change Password</h3>
        <form onSubmit={handleSavePassword} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-semibold text-gray-900"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={isSavingPassword || !newPassword}
              className="flex items-center gap-2 bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSavingPassword ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Update Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
