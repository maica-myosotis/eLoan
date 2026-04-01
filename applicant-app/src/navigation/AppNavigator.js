import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import RegisterWizardScreen from '../screens/RegisterWizardScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import SetPasswordScreen from '../screens/SetPasswordScreen';
import ApplicationDetailScreen from '../screens/ApplicationDetailScreen';
import ApplicationStack from './ApplicationStack';
import MainTabNavigator from './MainTabNavigator';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, loading } = useAuth();

  // Deep linking configuration
  const linking = {
    prefixes: ['eloan://', 'https://eloan.app'],
    config: {
      screens: {
        SetPassword: 'set-password/:uid/:token',
        Login: 'login',
      },
    },
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#17236a" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            {/* Protected Routes */}
            <Stack.Screen name="Main" component={MainTabNavigator} />
            <Stack.Screen name="ApplicationDetail" component={ApplicationDetailScreen} />
            <Stack.Screen name="ApplicationWizard" component={ApplicationStack} />
          </>
        ) : (
          <>
            {/* Public Routes */}
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="RegisterWizard" component={RegisterWizardScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="SetPassword" component={SetPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
