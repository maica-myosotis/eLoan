/**
 * Notifications Screen
 * Shows all notifications for the user
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import notificationService from '../services/notificationService';

const TYPE_ICONS = {
  new_application: '📝',
  status_change: '🔄',
  action_required: '⚠️',
  info: 'ℹ️',
  approval: '✅',
  rejection: '❌',
};

const NotificationItem = ({ notification, onPress, onLongPress }) => (
  <TouchableOpacity
    style={[styles.notificationCard, !notification.is_read && styles.notificationCardUnread]}
    onPress={onPress}
    onLongPress={onLongPress}
    activeOpacity={0.75}
  >
    <View style={styles.iconContainer}>
      <Text style={styles.typeIcon}>{TYPE_ICONS[notification.notification_type] || '📌'}</Text>
    </View>
    <View style={styles.notificationContent}>
      <Text style={[styles.title, !notification.is_read && styles.titleUnread]}>
        {notification.title}
      </Text>
      <Text style={styles.message} numberOfLines={2}>
        {notification.message}
      </Text>
      <Text style={styles.time}>
        {formatTimeAgo(notification.created_at)}
      </Text>
    </View>
    {!notification.is_read && <View style={styles.unreadDot} />}
  </TouchableOpacity>
);

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const [data, count] = await Promise.all([
        notificationService.getNotifications(),
        notificationService.getUnreadCount(),
      ]);
      setNotifications(data);
      setUnreadCount(count);
    } catch (error) {
      console.error('Load notifications error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications();
  }, [loadNotifications]);

  const handleNotificationPress = async (notification) => {
    if (!notification.is_read) {
      try {
        await notificationService.markAsRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) => n.id === notification.id ? { ...n, is_read: true } : n)
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Mark as read error:', error);
      }
    }
    if (notification.related_application_id) {
      navigation.navigate('ApplicationDetail', { id: notification.related_application_id });
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Mark all as read error:', error);
    }
  };

  const handleLongPress = (notification) => {
    const options = [];

    if (!notification.is_read) {
      options.push({
        text: 'Mark as Read',
        onPress: async () => {
          try {
            await notificationService.markAsRead(notification.id);
            setNotifications((prev) =>
              prev.map((n) => n.id === notification.id ? { ...n, is_read: true } : n)
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));
          } catch (error) {
            console.error('Mark as read error:', error);
          }
        },
      });
    }

    options.push({
      text: 'Archive',
      onPress: async () => {
        try {
          await notificationService.archiveNotification(notification.id);
          setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
          if (!notification.is_read) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        } catch (error) {
          console.error('Archive notification error:', error);
        }
      },
    });

    options.push({
      text: 'Delete',
      style: 'destructive',
      onPress: async () => {
        try {
          await notificationService.deleteNotification(notification.id);
          setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
          if (!notification.is_read) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        } catch (error) {
          console.error('Delete notification error:', error);
        }
      },
    });

    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Notification Options', notification.title, options);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#17236a" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </Text>
        </View>
        <TouchableOpacity style={styles.markAllButton} onPress={handleMarkAllRead}>
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={() => handleNotificationPress(item)}
            onLongPress={() => handleLongPress(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#17236a']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🔔</Text>
            <Text style={styles.emptyStateText}>No notifications yet</Text>
            <Text style={styles.emptyStateSubtext}>
              You'll be notified about your loan applications here
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ede9fe',
    borderRadius: 16,
  },
  markAllText: {
    fontSize: 12,
    color: '#17236a',
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  notificationCardUnread: {
    backgroundColor: '#f5f3ff',
    borderLeftWidth: 3,
    borderLeftColor: '#17236a',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  typeIcon: {
    fontSize: 18,
  },
  notificationContent: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  titleUnread: {
    fontWeight: '600',
    color: '#1f2937',
  },
  message: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    color: '#9ca3af',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#17236a',
    position: 'absolute',
    top: 16,
    right: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
