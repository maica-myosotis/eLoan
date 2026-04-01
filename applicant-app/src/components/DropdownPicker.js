/**
 * DropdownPicker
 * A modal-based dropdown/select component for React Native.
 * Works cross-platform without any extra dependencies.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * @param {string}   label         - Field label shown above the selector
 * @param {string}   placeholder   - Text shown when no value is selected
 * @param {*}        value         - Currently selected value
 * @param {Array}    options        - Array of { label, value } objects
 * @param {Function} onChange      - Called with the selected value
 * @param {boolean}  hasError      - Whether to show error styling
 * @param {string}   errorMessage  - Error text to display below
 * @param {boolean}  disabled      - Disables the picker
 */
export default function DropdownPicker({
  label,
  placeholder = 'Select an option',
  value,
  options = [],
  onChange,
  hasError = false,
  errorMessage,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TouchableOpacity
        style={[
          styles.selector,
          hasError && styles.selectorError,
          disabled && styles.selectorDisabled,
        ]}
        onPress={() => !disabled && setOpen(true)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.selectorText,
            !selectedOption && styles.placeholderText,
          ]}
          numberOfLines={1}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={disabled ? '#9ca3af' : '#6b7280'}
        />
      </TouchableOpacity>

      {hasError && errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      <Modal visible={open} transparent animationType="fade">
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        />
        <SafeAreaView style={styles.modalContainer} pointerEvents="box-none">
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label || 'Select'}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>

            {/* Options list */}
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color="#17236a" />
                    )}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              showsVerticalScrollIndicator={false}
              style={styles.list}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 6,
    fontWeight: '500',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 13,
    backgroundColor: '#fff',
    minHeight: 48,
  },
  selectorError: {
    borderColor: '#ef4444',
  },
  selectorDisabled: {
    backgroundColor: '#f9fafb',
    opacity: 0.6,
  },
  selectorText: {
    flex: 1,
    fontSize: 15,
    color: '#1f2937',
    marginRight: 8,
  },
  placeholderText: {
    color: '#9ca3af',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  // Modal
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '65%',
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    padding: 4,
  },
  list: {
    paddingVertical: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  optionSelected: {
    backgroundColor: '#ede9fe',
  },
  optionText: {
    fontSize: 15,
    color: '#374151',
    flex: 1,
  },
  optionTextSelected: {
    color: '#17236a',
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: '#f9fafb',
    marginHorizontal: 20,
  },
});
