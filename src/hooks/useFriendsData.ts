import { useCallback, useEffect, useState } from 'react';
import {
  acceptFriendRequest,
  declineFriendRequest,
  FriendListEntry,
  fetchFriends,
  fetchGiftCooldowns,
  fetchPendingRequests,
  PendingFriendRequest,
  removeFriend,
  sendFriendRequest,
  sendGift,
  setGiftPreference,
  subscribeFriendsRealtime,
} from '../services/friends';
import { GiftPreference } from '../gameConfig';
import { trackEvent } from '../telemetry';

const FALLBACK_POLL_MS = 90_000;

export interface UseFriendsDataReturn {
  friends: FriendListEntry[];
  pendingRequests: PendingFriendRequest[];
  giftCooldowns: Record<string, number>;
  myGiftPreference: GiftPreference;

  friendsBusy: boolean;
  friendsError: string | null;
  friendsLoadedOnce: boolean;

  friendSearch: string;
  setFriendSearch: (value: string) => void;

  // Actions
  updatePreference: (preference: GiftPreference) => Promise<void>;
  sendRequest: () => Promise<void>;
  acceptRequest: (fromUid: string) => Promise<void>;
  declineRequest: (fromUid: string) => Promise<void>;
  sendDailyGift: (friend: FriendListEntry) => Promise<void>;
  removeFriendEntry: (friendUid: string) => Promise<void>;
  refreshFriendsData: () => Promise<void>;
  clearFriendsError: () => void;
}

/**
 * Encapsulates all friends state: list, requests, gift cooldowns,
 * preference, search, and all CRUD actions with telemetry.
 */
export function useFriendsData(uid: string, displayName: string, active: boolean): UseFriendsDataReturn {
  const [friends, setFriends] = useState<FriendListEntry[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingFriendRequest[]>([]);
  const [giftCooldowns, setGiftCooldowns] = useState<Record<string, number>>({});
  const [myGiftPreference, setMyGiftPreference] = useState<GiftPreference>('gold');
  const [friendsBusy, setFriendsBusy] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [friendsLoadedOnce, setFriendsLoadedOnce] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');

  const refreshFriendsData = useCallback(async () => {
    if (!uid) return;
    setFriendsBusy(true);
    setFriendsError(null);
    try {
      const [friendRows, pendingRows, cooldownRows] = await Promise.all([
        fetchFriends(uid),
        fetchPendingRequests(uid),
        fetchGiftCooldowns(uid),
      ]);
      setFriends(friendRows);
      setPendingRequests(pendingRows);
      setGiftCooldowns(cooldownRows);
    } catch {
      setFriendsError('Failed to load friends data.');
    } finally {
      setFriendsBusy(false);
    }
  }, [uid]);

  // --- Realtime subscription with fallback polling ---
  useEffect(() => {
    if (!active || !uid) return;

    const stopRealtime = subscribeFriendsRealtime(
      uid,
      snapshot => {
        setFriends(snapshot.friends);
        setPendingRequests(snapshot.pendingRequests);
        setGiftCooldowns(snapshot.giftCooldowns);
        if (snapshot.profile?.giftPreference) setMyGiftPreference(snapshot.profile.giftPreference);
        setFriendsLoadedOnce(true);
      },
      () => {
        setFriendsError('Failed to load friends data.');
        setFriendsLoadedOnce(true);
      },
    );

    const fallbackTimer = setInterval(() => {
      void refreshFriendsData();
    }, FALLBACK_POLL_MS);

    return () => {
      stopRealtime();
      clearInterval(fallbackTimer);
    };
  }, [active, uid, refreshFriendsData]);

  // --- Actions ---
  const updatePreference = useCallback(
    async (preference: GiftPreference) => {
      if (!uid || friendsBusy) return;
      setFriendsBusy(true);
      setFriendsError(null);
      try {
        await setGiftPreference(uid, preference);
        setMyGiftPreference(preference);
      } catch {
        setFriendsError('Failed to update gift preference.');
      } finally {
        setFriendsBusy(false);
      }
    },
    [uid, friendsBusy],
  );

  const sendRequest = useCallback(async () => {
    if (!uid || !friendSearch.trim() || friendsBusy) return;
    setFriendsBusy(true);
    setFriendsError(null);
    try {
      await sendFriendRequest(uid, displayName, friendSearch);
      setFriendSearch('');
      await refreshFriendsData();
      void trackEvent('social_friend_request_sent');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send friend request.';
      setFriendsError(msg);
      void trackEvent('social_friend_request_failed', { reason: msg.slice(0, 80) });
    } finally {
      setFriendsBusy(false);
    }
  }, [uid, displayName, friendSearch, friendsBusy, refreshFriendsData]);

  const acceptRequest = useCallback(
    async (fromUid: string) => {
      if (!uid || friendsBusy) return;
      setFriendsBusy(true);
      setFriendsError(null);
      try {
        await acceptFriendRequest(uid, fromUid);
        await refreshFriendsData();
      } catch {
        setFriendsError('Failed to accept request.');
      } finally {
        setFriendsBusy(false);
      }
    },
    [uid, friendsBusy, refreshFriendsData],
  );

  const declineRequest = useCallback(
    async (fromUid: string) => {
      if (!uid || friendsBusy) return;
      setFriendsBusy(true);
      setFriendsError(null);
      try {
        await declineFriendRequest(uid, fromUid);
        await refreshFriendsData();
      } catch {
        setFriendsError('Failed to decline request.');
      } finally {
        setFriendsBusy(false);
      }
    },
    [uid, friendsBusy, refreshFriendsData],
  );

  const sendDailyGift = useCallback(
    async (friend: FriendListEntry) => {
      if (!uid || friendsBusy) return;
      setFriendsBusy(true);
      setFriendsError(null);
      try {
        await sendGift(uid, displayName, friend.uid, friend.giftPreference);
        await refreshFriendsData();
        void trackEvent('social_gift_sent', { preference: friend.giftPreference });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to send gift.';
        setFriendsError(msg);
        void trackEvent('social_gift_failed', { reason: msg.slice(0, 80) });
      } finally {
        setFriendsBusy(false);
      }
    },
    [uid, displayName, friendsBusy, refreshFriendsData],
  );

  const removeFriendEntry = useCallback(
    async (friendUid: string) => {
      if (!uid || friendsBusy) return;
      setFriendsBusy(true);
      setFriendsError(null);
      try {
        await removeFriend(uid, friendUid);
        await refreshFriendsData();
      } catch {
        setFriendsError('Failed to remove friend.');
      } finally {
        setFriendsBusy(false);
      }
    },
    [uid, friendsBusy, refreshFriendsData],
  );

  const clearFriendsError = useCallback(() => setFriendsError(null), []);

  return {
    friends,
    pendingRequests,
    giftCooldowns,
    myGiftPreference,
    friendsBusy,
    friendsError,
    friendsLoadedOnce,
    friendSearch,
    setFriendSearch,
    updatePreference,
    sendRequest,
    acceptRequest,
    declineRequest,
    sendDailyGift,
    removeFriendEntry,
    refreshFriendsData,
    clearFriendsError,
  };
}
