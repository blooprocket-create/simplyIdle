import React, { createContext, useContext, useMemo } from 'react';
import { UseChatDataReturn, useChatData, ChatIdentity } from '../../../hooks/useChatData';
import { UseFriendsDataReturn, useFriendsData } from '../../../hooks/useFriendsData';
import { UseGuildDataReturn, useGuildData } from '../../../hooks/useGuildData';
import { getFirebaseAuth } from '../../../services/firebase';

// ─── Individual domain contexts ───────────────────────────────────────────────
// Split into three contexts so that a chat message arriving doesn't
// re-render Friends or Guild sections (and vice versa).

const ChatContext = createContext<UseChatDataReturn | null>(null);
const FriendsContext = createContext<UseFriendsDataReturn | null>(null);
const GuildContext = createContext<UseGuildDataReturn | null>(null);

/** Shared identity passed to all social hooks. */
export interface SocialIdentity {
  uid: string;
  name: string;
  level: number;
  vipLevel: number;
}

interface SocialMeContextValue {
  me: SocialIdentity;
  isAdmin: boolean;
}

const MeContext = createContext<SocialMeContextValue | null>(null);

// ─── Hook accessors ───────────────────────────────────────────────────────────

export function useSocialChat(): UseChatDataReturn {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useSocialChat must be used within <SocialProvider>');
  return ctx;
}

export function useSocialFriends(): UseFriendsDataReturn {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error('useSocialFriends must be used within <SocialProvider>');
  return ctx;
}

export function useSocialGuild(): UseGuildDataReturn {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error('useSocialGuild must be used within <SocialProvider>');
  return ctx;
}

export function useSocialMe(): SocialMeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('useSocialMe must be used within <SocialProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface SocialProviderProps {
  accountName: string;
  publicUsername: string;
  level: number;
  vipLevel: number;
  isAdmin: boolean;
  /** true when the social tab is visible (powers subscriptions). */
  active: boolean;
  children: React.ReactNode;
}

/**
 * Top-level provider that initialises all three social domain hooks
 * and exposes them via isolated contexts.
 *
 * Wrap SocialTabContent with this so child components can read
 * chat / friends / guild data directly instead of prop-drilling.
 */
export function SocialProvider({
  accountName,
  publicUsername,
  level,
  vipLevel,
  isAdmin,
  active,
  children,
}: SocialProviderProps) {
  const me = useMemo<SocialIdentity>(() => {
    const authUid = getFirebaseAuth()?.currentUser?.uid ?? '';
    return {
      uid: authUid,
      name: (publicUsername || accountName).trim() || 'Player',
      level: Math.max(1, Math.floor(level || 1)),
      vipLevel: Math.max(0, Math.floor(vipLevel || 0)),
    };
  }, [accountName, publicUsername, level, vipLevel]);

  const meCtx = useMemo<SocialMeContextValue>(() => ({ me, isAdmin }), [me, isAdmin]);

  const chatIdentity = useMemo<ChatIdentity>(
    () => ({ uid: me.uid, name: me.name, level: me.level, vipLevel: me.vipLevel }),
    [me.uid, me.name, me.level, me.vipLevel],
  );

  // Hook up guild first because chat needs guildId.
  const guild = useGuildData(me.uid, me.name, active);
  const chat = useChatData(chatIdentity, guild.myGuild?.guildId ?? null, isAdmin, active);
  const friends = useFriendsData(me.uid, me.name, active);

  return (
    <MeContext.Provider value={meCtx}>
      <ChatContext.Provider value={chat}>
        <FriendsContext.Provider value={friends}>
          <GuildContext.Provider value={guild}>{children}</GuildContext.Provider>
        </FriendsContext.Provider>
      </ChatContext.Provider>
    </MeContext.Provider>
  );
}
