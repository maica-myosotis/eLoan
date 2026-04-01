/**
 * Main Tab Navigator
 * Bottom tab navigation for the main app screens
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import MyApplicationsScreen from '../screens/MyApplicationsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Services
import notificationService from '../services/notificationService';

const Tab = createBottomTabNavigator();

// Custom icon component (using text-based icons)
const TabIcon = ({ name, focused, color }) => {
  const icons = {
    home: focused ? '🏠' : '🏡',
    applications: focused ? '📋' : '📄',
    apply: '➕',
    notifications: focused ? '🔔' : '🔕',
    settings: focused ? '⚙️' : '⚙️',
  };

  return (
    <Text style={[styles.icon, { color }]}>
      {icons[name] || '•'}
    </Text>
  );
};

// Apply button placeholder component
const ApplyPlaceholder = () => null;

export default function MainTabNavigator({ navigation }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 120000); // Refresh every 2 minutes
    return () => clearInterval(interval);
  }, []);

  const loadUnreadCount = async () => {
    try {
      const count = await notificationService.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#17236a',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="home" focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MyApplications"
        component={MyApplicationsScreen}
        options={{
          tabBarLabel: 'My Loans',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="applications" focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Apply"
        component={ApplyPlaceholder}
        options={{
          tabBarLabel: '',
          tabBarIcon: ({ focused }) => (
            <View style={styles.applyButtonContainer}>
              <View style={styles.applyButton}>
                <Text style={styles.applyButtonText}>+</Text>
              </View>
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('ApplicationWizard');
          },
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarLabel: 'Alerts',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="notifications" focused={focused} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : null,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="settings" focused={focused} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    height: 70,
    paddingBottom: 10,
    paddingTop: 10,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  icon: {
    fontSize: 22,
  },
  applyButtonContainer: {
    position: 'absolute',
    top: -20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#17236a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17236a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  applyButtonText: {
    fontSize: 30,
    color: '#ffffff',
    fontWeight: '300',
    marginTop: -2,
  },
  badge: {
    backgroundColor: '#ef4444',
    fontSize: 10,
  },
});
