// src/components/NotificationInbox.js - Notification Inbox Component
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NotificationService from '../services/NotificationService';

const NotificationInbox = ({ navigation }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const userNotifications = await NotificationService.getUserNotifications(20, 0);
      setNotifications(userNotifications);
      
      const count = await NotificationService.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  useEffect(() => {
    loadNotifications();

    // Set up notification callbacks
    const handleNewNotification = (notification) => {
      console.log('New notification received in inbox:', notification);
      loadNotifications(); // Refresh the list
    };

    NotificationService.setNotificationCallback('received', handleNewNotification);

    return () => {
      NotificationService.removeNotificationCallback('received', handleNewNotification);
    };
  }, [loadNotifications]);

  const handleNotificationPress = async (notification) => {
    try {
      // Mark as read
      if (!notification.read_at) {
        await NotificationService.markNotificationAsRead(notification.notification_id);
        loadNotifications(); // Refresh to update UI
      }

      // Handle action if exists
      const notificationData = notification.notifications;
      if (notificationData.action_type && notificationData.action_value) {
        handleNotificationAction(notificationData.action_type, notificationData.action_value);
      }
    } catch (error) {
      console.error('Error handling notification press:', error);
    }
  };

  const handleNotificationAction = (actionType, actionValue) => {
    switch (actionType) {
      case 'screen':
        if (actionValue && navigation) {
          navigation.navigate(actionValue);
        }
        break;
      case 'product':
        if (actionValue && navigation) {
          navigation.navigate('ProductDetails', { productId: actionValue });
        }
        break;
      case 'category':
        if (actionValue && navigation) {
          navigation.navigate('CategoryScreen', { categoryId: actionValue });
        }
        break;
      case 'url':
        if (actionValue) {
          // Open URL in browser or web view
          Alert.alert('Open Link', `Open ${actionValue}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open', onPress: () => console.log('Open URL:', actionValue) }
          ]);
        }
        break;
      default:
        break;
    }
  };

  const clearAllNotifications = async () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to clear all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await NotificationService.clearAllNotifications();
              setNotifications([]);
              setUnreadCount(0);
            } catch (error) {
              console.error('Error clearing notifications:', error);
              Alert.alert('Error', 'Failed to clear notifications');
            }
          }
        }
      ]
    );
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'success': return 'checkmark-circle';
      case 'warning': return 'warning';
      case 'error': return 'alert-circle';
      case 'promotional': return 'gift';
      default: return 'information-circle';
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case 'success': return '#10B981';
      case 'warning': return '#F59E0B';
      case 'error': return '#EF4444';
      case 'promotional': return '#8B5CF6';
      default: return '#3B82F6';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderNotificationItem = ({ item }) => {
    const notification = item.notifications;
    const isUnread = !item.read_at;

    return (
      <TouchableOpacity
        style={[styles.notificationItem, isUnread && styles.unreadNotification]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.notificationContent}>
          <View style={styles.notificationHeader}>
            <View style={styles.iconContainer}>
              {notification.image_url ? (
                <Image
                  source={{ uri: notification.image_url }}
                  style={styles.notificationImage}
                  defaultSource={require('../../assets/placeholder.png')}
                />
              ) : (
                <View style={[styles.iconCircle, { backgroundColor: getNotificationColor(notification.type) }]}>
                  <Ionicons
                    name={getNotificationIcon(notification.type)}
                    size={20}
                    color="white"
                  />
                </View>
              )}
            </View>
            
            <View style={styles.textContainer}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, isUnread && styles.unreadText]} numberOfLines={1}>
                  {notification.title}
                </Text>
                {isUnread && <View style={styles.unreadDot} />}
              </View>
              
              <Text style={styles.message} numberOfLines={2}>
                {notification.message}
              </Text>
              
              <Text style={styles.timestamp}>
                {formatDate(notification.created_at)}
              </Text>
            </View>
          </View>
          
          {notification.action_type !== 'none' && (
            <View style={styles.actionIndicator}>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#EF4444" />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
          </View>
        )}
        {notifications.length > 0 && (
          <TouchableOpacity onPress={clearAllNotifications} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-outline" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No notifications</Text>
          <Text style={styles.emptySubtitle}>
            You'll see your notifications here when you receive them
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotificationItem}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#EF4444']}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  unreadBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
  },
  listContainer: {
    paddingVertical: 8,
  },
  notificationItem: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadNotification: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    marginRight: 12,
  },
  notificationImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  unreadText: {
    color: '#111827',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginLeft: 8,
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  actionIndicator: {
    paddingLeft: 8,
  },
});

export default NotificationInbox;