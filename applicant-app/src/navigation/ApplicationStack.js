/**
 * Application Stack Navigator
 * Multi-step loan application wizard
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ApplicationProvider } from '../context/ApplicationContext';

// Wizard Screens
import SelectLoanTypeScreen from '../screens/application/SelectLoanTypeScreen';
import PersonalDetailsScreen from '../screens/application/PersonalDetailsScreen';
import LoanDetailsScreen from '../screens/application/LoanDetailsScreen';
import LoanFormDataScreen from '../screens/application/LoanFormDataScreen';
import CoMakerScreen from '../screens/application/CoMakerScreen';
import DocumentUploadScreen from '../screens/application/DocumentUploadScreen';
import FaceVerificationScreen from '../screens/application/FaceVerificationScreen';
import ReviewSubmitScreen from '../screens/application/ReviewSubmitScreen';

const Stack = createStackNavigator();

const screenOptions = {
  headerStyle: {
    backgroundColor: '#17236a',
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTintColor: '#ffffff',
  headerTitleStyle: {
    fontWeight: '600',
  },
  headerBackTitle: 'Back',
  cardStyle: {
    backgroundColor: '#f9fafb',
  },
};

function ApplicationStackNavigator() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="SelectLoanType"
        component={SelectLoanTypeScreen}
        options={{ title: 'Select Loan Type' }}
      />
      <Stack.Screen
        name="PersonalDetails"
        component={PersonalDetailsScreen}
        options={{ title: 'Personal Details' }}
      />
      <Stack.Screen
        name="LoanDetails"
        component={LoanDetailsScreen}
        options={{ title: 'Loan Details' }}
      />
      <Stack.Screen
        name="LoanFormData"
        component={LoanFormDataScreen}
        options={{ title: 'Loan Details' }}
      />
      <Stack.Screen
        name="CoMaker"
        component={CoMakerScreen}
        options={{ title: 'Co-Maker Information' }}
      />
      <Stack.Screen
        name="DocumentUpload"
        component={DocumentUploadScreen}
        options={{ title: 'Upload Documents' }}
      />
      <Stack.Screen
        name="FaceVerification"
        component={FaceVerificationScreen}
        options={{ title: 'Identity Verification' }}
      />
      <Stack.Screen
        name="ReviewSubmit"
        component={ReviewSubmitScreen}
        options={{ title: 'Review & Submit' }}
      />
    </Stack.Navigator>
  );
}

// Wrap with ApplicationProvider
export default function ApplicationStack() {
  return (
    <ApplicationProvider>
      <ApplicationStackNavigator />
    </ApplicationProvider>
  );
}
