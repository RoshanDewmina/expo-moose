// File: app/pv-detail/[pvSystemId].tsx

import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  Image,
  ActivityIndicator,
  ScrollView,
  FlatList,
  Linking,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import * as api from "@/api/api";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";
import { Card, Divider, Chip, Button } from "react-native-paper";
import { getCurrentUser, hasSystemAccess } from "@/utils/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LocalIonicon } from "@/components/ui/LocalIonicon";
import { LineChart, BarChart } from "react-native-chart-kit";

const findChannelValue = (
  channels:
    | api.FlowDataChannel[]
    | api.AggregatedDataChannel[]
    | api.WeatherChannel[]
    | undefined,
  channelName: string
): any | null => {
  return channels?.find((c) => c.channelName === channelName)?.value ?? null;
};

const formatDateTime = (isoString: string | null | undefined): string => {
  if (!isoString) return "N/A";
  try {
    return new Date(isoString).toLocaleString();
  } catch (e) {
    return "Invalid Date";
  }
};
const formatDate = (isoString: string | null | undefined): string => {
  if (!isoString) return "N/A";
  try {
    return new Date(isoString).toLocaleDateString();
  } catch (e) {
    return "Invalid Date";
  }
};

// Add a helper function to format API date strings properly
const formatApiDateString = (date: Date): string => {
  // Format to YYYY-MM-DDThh:mm:ssZ without milliseconds
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
};

// Update the getIsoDateString function to format dates correctly for API
const getIsoDateString = (date: Date): string => {
  return formatApiDateString(date);
};

export default function PvSystemDetailScreen() {
  const { pvSystemId } = useLocalSearchParams<{ pvSystemId?: string }>();
  const router = useRouter();
  const { isDarkMode, colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // State for all fetched data
  const [pvSystemDetails, setPvSystemDetails] =
    useState<api.PvSystemMetadata | null>(null);
  const [flowData, setFlowData] = useState<api.FlowDataResponse | null>(null);
  const [aggregatedDataToday, setAggregatedDataToday] =
    useState<api.AggregatedDataResponse | null>(null);
  const [aggregatedDataTotal, setAggregatedDataTotal] =
    useState<api.AggregatedDataResponse | null>(null);
  const [weatherData, setWeatherData] =
    useState<api.CurrentWeatherResponse | null>(null);
  const [messages, setMessages] = useState<api.SystemMessage[]>([]);
  const [devices, setDevices] = useState<api.DeviceMetadata[]>([]);

  // Combined loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add state for demo mode
  const [demoMode, setDemoMode] = useState(false);

  // State for historical chart data
  const [energyHistData, setEnergyHistData] =
    useState<api.HistoricalDataResponse | null>(null);
  const [selectedChartPeriod, setSelectedChartPeriod] = useState<
    "day" | "week" | "month" | "year"
  >("day");
  const [chartLoading, setChartLoading] = useState(false);

  // Add state for selected time period in dashboard
  const [selectedDashboardPeriod, setSelectedDashboardPeriod] = useState<
    "today" | "week" | "month" | "year"
  >("today");

  // Add states for different period metrics
  const [weeklyEnergyProduction, setWeeklyEnergyProduction] = useState<
    number | null
  >(null);
  const [monthlyEnergyProduction, setMonthlyEnergyProduction] = useState<
    number | null
  >(null);
  const [yearlyEnergyProduction, setYearlyEnergyProduction] = useState<
    number | null
  >(null);

  // Add states for period-specific CO2 savings
  const [dailyCo2Savings, setDailyCo2Savings] = useState<number | null>(null);
  const [weeklyCo2Savings, setWeeklyCo2Savings] = useState<number | null>(null);
  const [monthlyCo2Savings, setMonthlyCo2Savings] = useState<number | null>(
    null
  );
  const [yearlyCo2Savings, setYearlyCo2Savings] = useState<number | null>(null);

  // Dashboard flatlist ref for programmatic scrolling
  const dashboardFlatListRef = useRef<FlatList>(null);

  // Check if user has access to this system
  useEffect(() => {
    const checkAccess = async () => {
      try {
        setCheckingAccess(true);
        if (!pvSystemId) return;

        const user = await getCurrentUser();
        if (!user) {
          setHasAccess(false);
          router.replace("/"); // Redirect to login if not authenticated
          return;
        }

        setIsAdmin(user.role === "admin");
        const access = hasSystemAccess(user.id, pvSystemId as string);
        setHasAccess(access);

        if (!access) {
          setLoading(false);
        }
      } catch (error) {
        console.error("Error checking access:", error);
        setHasAccess(false);
      } finally {
        setCheckingAccess(false);
      }
    };

    checkAccess();
  }, [pvSystemId, router]);

  // After the useEffect for fetching data, add another useEffect to check for demo mode status
  // This should be the first useEffect after all the state declarations
  useEffect(() => {
    // Check if the dashboard has enabled demo mode and sync state
    const checkDemoMode = async () => {
      try {
        const demoModeValue = await AsyncStorage.getItem("demo_mode");
        setDemoMode(demoModeValue === "true");
      } catch (error) {
        console.error("Error retrieving demo mode state:", error);
      }
    };

    checkDemoMode();
  }, []);

  // Add toggle demo mode function
  const toggleDemoMode = async () => {
    const newDemoMode = !demoMode;
    setDemoMode(newDemoMode);

    // Store demo mode setting so dashboard can retrieve it
    try {
      await AsyncStorage.setItem("demo_mode", newDemoMode.toString());
      console.log(`Demo mode ${newDemoMode ? "enabled" : "disabled"}`);
    } catch (error) {
      console.error("Error saving demo mode state:", error);
    }
  };

  // Add function to manually trigger demo error messages in demo mode
  const addDemoErrorMessage = () => {
    if (!demoMode) return;

    // Create a random demo error message
    const errorCodes = [
      { code: 567, message: "Inverter communication timeout" },
      { code: 101, message: "Grid voltage too high" },
      { code: 302, message: "Temperature sensor fault" },
      { code: 736, message: "Fan malfunction detected" },
      { code: 415, message: "Battery connection error" },
    ];

    const randomError =
      errorCodes[Math.floor(Math.random() * errorCodes.length)];

    const newErrorMessage: api.SystemMessage = {
      pvSystemId: pvSystemId as string,
      deviceId: "demo-device-" + Math.floor(Math.random() * 1000),
      stateType: "Error",
      stateSeverity: "Error",
      stateCode: randomError.code,
      logDateTime: new Date().toISOString(),
      text: `Demo Error: ${randomError.message}`,
    };

    // Add to the messages state
    setMessages((prev) => [newErrorMessage, ...prev]);
  };

  // --- Date Helpers ---
  const getShortDateString = (date: Date): string => {
    return date.toISOString().split("T")[0]; // YYYY-MM-DD
  };

  const fetchAllData = async () => {
    if (hasAccess === false) return;

    setLoading(true);
    setError(null);
    console.log(`Fetching all data for system: ${pvSystemId}`);

    try {
      if (!pvSystemId || typeof pvSystemId !== "string") {
        throw new Error("Invalid or missing PV System ID");
      }

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30); // Go back 30 days
      const toDate = new Date();

      // Create dates for different periods
      const weekFromDate = new Date();
      weekFromDate.setDate(weekFromDate.getDate() - 7);

      const monthFromDate = new Date();
      monthFromDate.setMonth(monthFromDate.getMonth() - 1);

      const yearFromDate = new Date();
      yearFromDate.setFullYear(yearFromDate.getFullYear() - 1);

      const [
        details,
        flow,
        aggrToday,
        aggrWeek,
        aggrMonth,
        aggrYear,
        aggrCo2Today,
        aggrCo2Week,
        aggrCo2Month,
        aggrCo2Year,
        aggrTotal,
        weather,
        msgs,
        devs,
      ] = await Promise.allSettled([
        api.getPvSystemDetails(pvSystemId),
        api.getPvSystemFlowData(pvSystemId),
        api.getPvSystemAggregatedData(pvSystemId, {
          from: getShortDateString(new Date()),
          duration: 1,
        }),
        // Weekly data
        api.getPvSystemAggregatedData(pvSystemId, {
          from: getShortDateString(weekFromDate),
          duration: 7,
          channel: "EnergyProductionTotal",
        }),
        // Monthly data
        api.getPvSystemAggregatedData(pvSystemId, {
          from: getShortDateString(monthFromDate),
          duration: 30,
          channel: "EnergyProductionTotal",
        }),
        // Yearly data
        api.getPvSystemAggregatedData(pvSystemId, {
          from: getShortDateString(yearFromDate),
          duration: 365,
          channel: "EnergyProductionTotal",
        }),
        // Daily CO2 savings
        api.getPvSystemAggregatedData(pvSystemId, {
          from: getShortDateString(new Date()),
          duration: 1,
          channel: "SavingsCO2",
        }),
        // Weekly CO2 savings
        api.getPvSystemAggregatedData(pvSystemId, {
          from: getShortDateString(weekFromDate),
          duration: 7,
          channel: "SavingsCO2",
        }),
        // Monthly CO2 savings
        api.getPvSystemAggregatedData(pvSystemId, {
          from: getShortDateString(monthFromDate),
          duration: 30,
          channel: "SavingsCO2",
        }),
        // Yearly CO2 savings
        api.getPvSystemAggregatedData(pvSystemId, {
          from: getShortDateString(yearFromDate),
          duration: 365,
          channel: "SavingsCO2",
        }),
        api.getPvSystemAggregatedData(pvSystemId, {
          period: "total",
          channel: "SavingsCO2",
        }),
        api.getCurrentWeather(pvSystemId),
        api.getPvSystemMessages(pvSystemId, {
          stateseverity: "Error",
          limit: 10,
          from: formatApiDateString(fromDate),
          to: formatApiDateString(toDate),
        }),
        api.getPvSystemDevices(pvSystemId),
      ]);

      // Set State based on results
      if (details.status === "fulfilled") setPvSystemDetails(details.value);
      else {
        console.error("Failed Details:", details.reason);
        throw details.reason;
      } // Throw if essential details fail

      if (flow.status === "fulfilled") setFlowData(flow.value);
      else console.error("Failed Flow:", flow.reason);

      if (aggrToday.status === "fulfilled")
        setAggregatedDataToday(aggrToday.value);
      else console.error("Failed Aggr Today:", aggrToday.reason);

      // Set period data
      if (aggrWeek.status === "fulfilled") {
        const totalWeeklyEnergy = aggrWeek.value.data.reduce((total, item) => {
          const value = findChannelValue(
            item.channels,
            "EnergyProductionTotal"
          );
          return total + (value || 0);
        }, 0);
        setWeeklyEnergyProduction(totalWeeklyEnergy);
      } else console.error("Failed Aggr Week:", aggrWeek.reason);

      if (aggrMonth.status === "fulfilled") {
        const totalMonthlyEnergy = aggrMonth.value.data.reduce(
          (total, item) => {
            const value = findChannelValue(
              item.channels,
              "EnergyProductionTotal"
            );
            return total + (value || 0);
          },
          0
        );
        setMonthlyEnergyProduction(totalMonthlyEnergy);
      } else console.error("Failed Aggr Month:", aggrMonth.reason);

      if (aggrYear.status === "fulfilled") {
        const totalYearlyEnergy = aggrYear.value.data.reduce((total, item) => {
          const value = findChannelValue(
            item.channels,
            "EnergyProductionTotal"
          );
          return total + (value || 0);
        }, 0);
        setYearlyEnergyProduction(totalYearlyEnergy);
      } else console.error("Failed Aggr Year:", aggrYear.reason);

      if (aggrTotal.status === "fulfilled")
        setAggregatedDataTotal(aggrTotal.value);
      else console.error("Failed Aggr Total:", aggrTotal.reason);

      if (weather.status === "fulfilled") setWeatherData(weather.value);
      else console.error("Failed Weather:", weather.reason);

      if (msgs.status === "fulfilled") {
        // Check if we got valid messages back
        if (Array.isArray(msgs.value)) {
          setMessages(msgs.value);
          console.log(
            `Loaded ${msgs.value.length} error messages for system ${pvSystemId}`
          );
        } else {
          console.warn("Unexpected message format:", msgs.value);
          setMessages([]); // Default to empty array
        }
      } else {
        console.error("Failed to fetch Messages:", msgs.reason);
        setMessages([]); // Default to empty array on error
      }

      if (devs.status === "fulfilled")
        setDevices(devs.value ?? []); // Default to empty array if null
      else console.error("Failed Devices:", devs.reason);

      // Set CO2 data for different periods
      if (aggrCo2Today.status === "fulfilled") {
        const co2Value = findChannelValue(
          aggrCo2Today.value.data?.[0]?.channels,
          "SavingsCO2"
        );
        setDailyCo2Savings(co2Value);
      } else console.error("Failed CO2 Today:", aggrCo2Today.reason);

      if (aggrCo2Week.status === "fulfilled") {
        const totalWeeklyCo2 = aggrCo2Week.value.data.reduce((total, item) => {
          const value = findChannelValue(item.channels, "SavingsCO2");
          return total + (value || 0);
        }, 0);
        setWeeklyCo2Savings(totalWeeklyCo2);
      } else console.error("Failed CO2 Week:", aggrCo2Week.reason);

      if (aggrCo2Month.status === "fulfilled") {
        const totalMonthlyCo2 = aggrCo2Month.value.data.reduce(
          (total, item) => {
            const value = findChannelValue(item.channels, "SavingsCO2");
            return total + (value || 0);
          },
          0
        );
        setMonthlyCo2Savings(totalMonthlyCo2);
      } else console.error("Failed CO2 Month:", aggrCo2Month.reason);

      if (aggrCo2Year.status === "fulfilled") {
        const totalYearlyCo2 = aggrCo2Year.value.data.reduce((total, item) => {
          const value = findChannelValue(item.channels, "SavingsCO2");
          return total + (value || 0);
        }, 0);
        setYearlyCo2Savings(totalYearlyCo2);
      } else console.error("Failed CO2 Year:", aggrCo2Year.reason);
    } catch (err) {
      console.error("Error fetching PV system data:", err);
      setError(
        `Failed to load system data: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Function to fetch historical data for charts
  const fetchHistoricalData = async (
    period: "day" | "week" | "month" | "year"
  ) => {
    if (!pvSystemId || hasAccess === false) return;

    setChartLoading(true);
    setEnergyHistData(null); // Clear previous data

    try {
      const now = new Date();
      let fromDate = new Date();
      let toDate = new Date(now); // Use current time as 'to' for day view

      console.log(`Fetching energy data for ${period} view`);

      if (period === "day") {
        // For day view, use historical data API for more granular 24-hour data
        fromDate.setHours(now.getHours() - 24); // Set 'from' date to 24 hours ago

        // Format dates correctly for the histdata API (ISO 8601)
        const fromStr = getIsoDateString(fromDate);
        const toStr = getIsoDateString(toDate);

        console.log(`Fetching historical data from ${fromStr} to ${toStr}`);

        try {
          // Call getPvSystemHistoricalData instead of getPvSystemAggregatedData
          const energyData = await api.getPvSystemHistoricalData(
            pvSystemId as string,
            {
            from: fromStr,
            to: toStr,
              channel: "EnergyProductionTotal",
              // Optional: Add timezone parameter if needed
              timezone: "local",
            }
          );

          if (energyData && energyData.data && energyData.data.length > 0) {
            // Set the state directly with the HistoricalDataResponse
            setEnergyHistData(energyData);
          console.log(
              `Retrieved ${energyData.data.length} data points for ${period} energy chart`
          );
        } else {
            console.log(`No historical data returned for ${period} view`);
            setEnergyHistData(null);
          }
        } catch (err) {
          console.error(
            `Failed to fetch historical energy data for ${period}:`,
            err
          );
          setEnergyHistData(null);
        }
      } else {
        // Keep existing logic for week, month, year using getPvSystemAggregatedData
        let durationDays: number;

        // Determine time range based on period
        if (period === "week") {
          fromDate.setDate(now.getDate() - 7);
          durationDays = 7;
        } else if (period === "month") {
          fromDate.setMonth(now.getMonth() - 1);
          durationDays = 30;
        } else {
          // year
          fromDate.setFullYear(now.getFullYear() - 1);
          durationDays = 365;
        }

        // Format date string for API
        const fromStr = getShortDateString(fromDate);

        console.log(
          `Fetching aggregated energy data for ${period} view from ${fromStr} for ${durationDays} days`
        );

        try {
          // For all periods, we fetch aggregated daily data
          const energyData = await api.getPvSystemAggregatedData(
            pvSystemId as string,
            {
              from: fromStr,
              duration: durationDays,
              channel: "EnergyProductionTotal",
            }
          );

          if (energyData && energyData.data && energyData.data.length > 0) {
            // Adapt aggregated data format to match historical data format if needed
            const adaptedEnergyData: api.HistoricalDataResponse = {
              pvSystemId: energyData.pvSystemId,
              deviceId: energyData.deviceId || null,
              data: energyData.data.map((item) => ({
                logDateTime: item.logDateTime.includes("T")
                  ? item.logDateTime
                  : `${item.logDateTime}T00:00:00Z`, // Ensure proper datetime format
                logDuration: 86400, // Duration for a day in seconds
                channels: item.channels.map((ch) => ({ ...ch })),
              })),
            };

            console.log(
              `Retrieved ${adaptedEnergyData.data.length} data points for ${period} energy chart`
            );

            setEnergyHistData(adaptedEnergyData);
          } else {
            console.log(`No data returned for ${period} view`);
            setEnergyHistData(null);
          }
        } catch (err) {
          console.error(`Failed to fetch energy data for ${period}:`, err);
          setEnergyHistData(null);
        }
      }
    } catch (err) {
      console.error(`Error fetching chart data for period ${period}:`, err);
    } finally {
      setChartLoading(false);
    }
  };

  useEffect(() => {
    if (checkingAccess) return;

    if (hasAccess === false) {
      setLoading(false);
      return;
    }

    if (!pvSystemId || typeof pvSystemId !== "string") {
      // Type check pvSystemId
      setError("Invalid or missing PV System ID.");
      setLoading(false);
      return;
    }

    fetchAllData();
  }, [pvSystemId, hasAccess, checkingAccess]);

  // Fetch historical data when selected period changes or on initial load
  useEffect(() => {
    if (hasAccess && pvSystemId && !checkingAccess) {
      fetchHistoricalData(selectedChartPeriod);
    }
  }, [selectedChartPeriod, pvSystemId, hasAccess, checkingAccess]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAllData();
    fetchHistoricalData(selectedChartPeriod);
  };

  // Extract Key Data Points (with null checks) ---
  const currentPowerOutput = findChannelValue(
    flowData?.data?.channels,
    "PowerPV"
  );
  const dailyEnergyProduction = findChannelValue(
    aggregatedDataToday?.data?.[0]?.channels,
    "EnergyProductionTotal"
  );
  const totalCo2Savings = findChannelValue(
    aggregatedDataTotal?.data?.[0]?.channels,
    "SavingsCO2"
  );
  const systemIsOnline = flowData?.status?.isOnline ?? false;
  const latestErrorMessages = messages.filter(
    (m) => m.stateSeverity === "Error"
  );

  // Determine system status: offline, warning, or online
  const systemStatus = !systemIsOnline
    ? "offline"
    : latestErrorMessages.length > 0
    ? "warning"
    : "online";

  // Define status colors
  const statusColors = {
    online: "#4CAF50", // Green
    warning: "#FF9800", // Orange for warning state
    offline: "#F44336", // Red
  };

  const systemStatusColor = statusColors[systemStatus];

  // Calculate earnings based on energy production and rate of $0.40/kWh
  const calculateEarnings = (energyWh: number | null): string => {
    if (energyWh === null) return "N/A";
    // Convert Wh to kWh and multiply by rate
    const earningsDollars = (energyWh / 1000) * 0.4;
    return `$${earningsDollars.toFixed(2)}`;
  };

  // Dashboard data for swipeable cards - moved after variable declarations
  const dashboardData = [
    {
      id: "today",
      title: "Today",
      metrics: [
        {
          label: "Current Power",
          value:
            currentPowerOutput !== null
              ? `${(currentPowerOutput / 1000).toFixed(1)} kW`
              : "N/A",
        },
        {
          label: "Energy",
          value:
            dailyEnergyProduction !== null
              ? `${(dailyEnergyProduction / 1000).toFixed(1)} kWh`
              : "N/A",
        },
        {
          label: "CO₂ Saved",
          value:
            dailyCo2Savings !== null
              ? `${dailyCo2Savings.toFixed(1)} kg`
              : "N/A",
        },
        {
          label: "Earnings",
          value: calculateEarnings(dailyEnergyProduction),
        },
      ],
    },
    {
      id: "week",
      title: "Week",
      metrics: [
        {
          label: "Current Power",
          value:
            currentPowerOutput !== null
              ? `${(currentPowerOutput / 1000).toFixed(1)} kW`
              : "N/A",
        },
        {
          label: "Weekly Energy",
          value:
            weeklyEnergyProduction !== null
              ? `${(weeklyEnergyProduction / 1000).toFixed(1)} kWh`
              : "N/A",
        },
        {
          label: "CO₂ Saved",
          value:
            weeklyCo2Savings !== null
              ? `${weeklyCo2Savings.toFixed(1)} kg`
              : "N/A",
        },
        {
          label: "Earnings",
          value: calculateEarnings(weeklyEnergyProduction),
        },
      ],
    },
    {
      id: "month",
      title: "Month",
      metrics: [
        {
          label: "Monthly Energy",
          value:
            monthlyEnergyProduction !== null
              ? `${(monthlyEnergyProduction / 1000).toFixed(1)} kWh`
              : "N/A",
        },
        {
          label: "Avg Daily Energy",
          value:
            monthlyEnergyProduction !== null
              ? `${(monthlyEnergyProduction / 30 / 1000).toFixed(1)} kWh`
              : "N/A",
        },
        {
          label: "CO₂ Saved",
          value:
            monthlyCo2Savings !== null
              ? `${monthlyCo2Savings.toFixed(1)} kg`
              : "N/A",
        },
        {
          label: "Earnings",
          value: calculateEarnings(monthlyEnergyProduction),
        },
      ],
    },
    {
      id: "year",
      title: "Year",
      metrics: [
        {
          label: "Yearly Energy",
          value:
            yearlyEnergyProduction !== null
              ? `${(yearlyEnergyProduction / 1000).toFixed(1)} kWh`
              : "N/A",
        },
        {
          label: "Avg Monthly Energy",
          value:
            yearlyEnergyProduction !== null
              ? `${(yearlyEnergyProduction / 12 / 1000).toFixed(1)} kWh`
              : "N/A",
        },
        {
          label: "CO₂ Saved",
          value:
            yearlyCo2Savings !== null
              ? `${yearlyCo2Savings.toFixed(1)} kg`
              : "N/A",
        },
        {
          label: "Earnings",
          value: calculateEarnings(yearlyEnergyProduction),
        },
      ],
    },
  ];

  // Render dashboard time period indicator
  const DashboardPeriodIndicator = () => {
    return (
      <View style={styles.periodSelectorContainer}>
        {dashboardData.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.periodButton,
              selectedDashboardPeriod === item.id && styles.periodButtonActive,
            ]}
            onPress={() => {
              setSelectedDashboardPeriod(
                item.id as "today" | "week" | "month" | "year"
              );
              // Find index of the item
              const index = dashboardData.findIndex(
                (data) => data.id === item.id
              );
              dashboardFlatListRef.current?.scrollToIndex({
                animated: true,
                index,
              });
            }}
          >
            <ThemedText
              style={[
                styles.periodButtonText,
                selectedDashboardPeriod === item.id &&
                  styles.periodButtonTextActive,
              ]}
            >
              {item.title}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // Render a dashboard card
  const renderDashboardCard = ({
    item,
  }: {
    item: (typeof dashboardData)[0];
  }) => {
    return (
      <View
        style={{
          width: Dimensions.get("window").width - 32,
          paddingHorizontal: 5,
        }}
      >
        <View style={styles.kpiContainer}>
          {item.metrics.map((metric, index) => (
            <View
              key={index}
              style={[
                styles.kpiItem,
                { backgroundColor: isDarkMode ? colors.background : "#f8f8f8" },
              ]}
            >
              <ThemedText
                style={styles.kpiLabel}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {metric.label}
              </ThemedText>
              <ThemedText
                style={[styles.kpiValue, { color: colors.primary }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {metric.value}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // --- Access Denied State ---
  if (hasAccess === false && !checkingAccess) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: isDarkMode ? colors.background : "#f5f5f5" },
        ]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButtonContainer}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}>
            Access Denied
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={70} color="#f44336" />
          <ThemedText style={[styles.errorText, { marginTop: 20 }]}>
            You don't have access to this PV system.
          </ThemedText>
          <Text
            style={[
              styles.accessDeniedSubtext,
              { marginTop: 10, color: isDarkMode ? "#aaa" : "#666" },
            ]}
          >
            System ID: {pvSystemId}
          </Text>
          <Button
            mode="contained"
            onPress={() => router.back()}
            style={{ marginTop: 20 }}
          >
            Go Back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // --- Loading State ---
  if ((loading && !refreshing) || checkingAccess) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: isDarkMode ? colors.background : "#f5f5f5" },
        ]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText style={styles.loadingText}>
            {checkingAccess
              ? "Checking access..."
              : "Loading System Dashboard..."}
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: isDarkMode ? colors.background : "#f5f5f5" },
        ]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.centered}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity
            style={[
              styles.retryButton,
              { backgroundColor: colors.primary + "20" },
            ]}
            onPress={onRefresh}
          >
            <ThemedText style={{ color: colors.primary }}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // --- No Data State ---
  if (!pvSystemDetails) {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: isDarkMode ? colors.background : "#f5f5f5" },
        ]}
        edges={["top", "left", "right"]}
      >
        <View style={styles.centered}>
          <ThemedText style={styles.errorText}>
            No PV system data could be loaded.
          </ThemedText>
          <TouchableOpacity
            style={[
              styles.retryButton,
              { backgroundColor: colors.primary + "20" },
            ]}
            onPress={onRefresh}
          >
            <ThemedText style={{ color: colors.primary }}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const getWeatherDescription = (symbolCode: string | null): string => {
    if (!symbolCode) return "Unknown";

    const weatherMap: Record<string, string> = {
      "1": "Sunny",
      "2": "Partly Cloudy",
      "3": "Cloudy",
      "4": "Overcast",
      "5": "Fog",
      "6": "Light Rain",
      "7": "Rain",
      "8": "Heavy Rain",
      "9": "Thunderstorm",
      "10": "Light Snow",
      "11": "Snow",
      "12": "Heavy Snow",
      "13": "Sleet",
      // Add more mappings as needed
    };

    return weatherMap[symbolCode] || `Weather code ${symbolCode}`;
  };

  // Weather Widget Component
  const WeatherWidget = () => {
    if (!weatherData || !weatherData.data) {
      return (
        <Animated.View
          entering={FadeInUp.delay(200).springify()}
          style={[
            styles.section,
            { backgroundColor: isDarkMode ? colors.card : "#fff" },
          ]}
        >
          <ThemedText style={styles.sectionTitle}>
            Weather Conditions
          </ThemedText>
          <View style={styles.weatherNoDataContent}>
            <Ionicons
              name="cloudy-outline"
              size={48}
              color={isDarkMode ? "#888" : "#aaaaaa"}
            />
            <ThemedText style={[styles.infoValue, { marginTop: 12 }]}>
              Weather data unavailable
            </ThemedText>
          </View>
        </Animated.View>
      );
    }

    // Extract weather data
    const temperature = findChannelValue(weatherData.data.channels, "Temp");
    const humidity = findChannelValue(
      weatherData.data.channels,
      "RelativeHumidity"
    );
    const windSpeed = findChannelValue(weatherData.data.channels, "WindSpeed");
    const cloudCover = findChannelValue(
      weatherData.data.channels,
      "CloudCover"
    );
    const irradiance = findChannelValue(
      weatherData.data.channels,
      "Irradiation"
    );
    const weatherSymbol = findChannelValue(weatherData.data.channels, "Symbol");

    // Get weather description and icon
    const weatherDesc = getWeatherDescription(weatherSymbol);
    const weatherIcon = getWeatherIcon(weatherSymbol);

    // Define weather assessment for solar production
    const getWeatherAssessment = () => {
      if (cloudCover !== null) {
        if (cloudCover < 30) return { text: "Excellent", color: "#4CAF50" };
        if (cloudCover < 60) return { text: "Good", color: "#8BC34A" };
        if (cloudCover < 80) return { text: "Fair", color: "#FFC107" };
        return { text: "Poor", color: "#FF9800" };
      }

      // Fallback if no cloud cover data
      if (weatherSymbol) {
        const symbol = Number(weatherSymbol);
        if (symbol <= 1) return { text: "Excellent", color: "#4CAF50" };
        if (symbol <= 3) return { text: "Good", color: "#8BC34A" };
        if (symbol <= 5) return { text: "Fair", color: "#FFC107" };
        return { text: "Poor", color: "#FF9800" };
      }

      return { text: "Unknown", color: "#9E9E9E" };
    };

    const assessment = getWeatherAssessment();

    return (
      <Animated.View
        entering={FadeInUp.delay(200).springify()}
        style={[
          styles.section,
          { backgroundColor: isDarkMode ? colors.card : "#fff" },
        ]}
      >
        <ThemedText style={styles.sectionTitle}>Weather Conditions</ThemedText>

        <View style={styles.weatherHeader}>
          <View style={styles.weatherMainInfo}>
          <View style={styles.weatherIconContainer}>
              <Ionicons name={weatherIcon} size={48} color={colors.primary} />
          </View>
            <View>
              <Text style={[styles.weatherTemperature, { color: colors.text }]}>
              {temperature !== null ? `${temperature.toFixed(1)}°C` : "--°C"}
              </Text>
              <Text style={[styles.weatherCondition, { color: colors.text }]}>
                {weatherDesc}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.assessmentBadge,
              { backgroundColor: `${assessment.color}20` },
            ]}
          >
            {/* <Text style={[styles.assessmentText, { color: assessment.color }]}>
              {assessment.text} for solar
            </Text> */}
          </View>
        </View>

        <View style={styles.weatherGridContainer}>
          <View style={styles.weatherGridItem}>
            <Ionicons name="water-outline" size={22} color={colors.primary} />
            <ThemedText style={styles.weatherGridLabel}>Humidity:</ThemedText>
            <ThemedText
              style={styles.weatherGridValue}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
                  {humidity !== null ? `${humidity.toFixed(0)}%` : "--"}
                </ThemedText>
              </View>

          <View style={styles.weatherGridItem}>
                <Ionicons
                  name="speedometer-outline"
              size={22}
                  color={colors.primary}
                />
            <ThemedText style={styles.weatherGridLabel}>Wind:</ThemedText>
            <ThemedText
              style={styles.weatherGridValue}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
                  {windSpeed !== null ? `${windSpeed.toFixed(1)} km/h` : "--"}
                </ThemedText>
              </View>

          <View style={styles.weatherGridItem}>
            <Ionicons name="cloudy-outline" size={22} color={colors.primary} />
            <ThemedText style={styles.weatherGridLabel}>
              Cloud Cover:
            </ThemedText>
            <ThemedText
              style={styles.weatherGridValue}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {cloudCover !== null ? `${cloudCover.toFixed(0)}%` : "--"}
            </ThemedText>
            </View>

          <View style={styles.weatherGridItem}>
            <Ionicons name="sunny-outline" size={22} color={colors.primary} />
            <ThemedText style={styles.weatherGridLabel}>Irradiance:</ThemedText>
            <ThemedText
              style={styles.weatherGridValue}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {irradiance !== null ? `${irradiance.toFixed(0)} W/m²` : "--"}
            </ThemedText>
          </View>
        </View>

        <Text
          style={[styles.weatherUpdated, { color: colors.text, opacity: 0.5 }]}
        >
          Last updated: {formatDateTime(weatherData.data.logDateTime)}
        </Text>
      </Animated.View>
    );
  };

  // Helper function to get weather icon name based on symbol code
  const getWeatherIcon = (
    symbol: string | null
  ): keyof typeof Ionicons.glyphMap => {
    if (!symbol) return "cloudy-outline";

    const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
      "1": "sunny-outline",
      "2": "partly-sunny-outline",
      "3": "cloud-outline",
      "4": "cloudy-outline",
      "5": "cloud-outline", // Fog
      "6": "rainy-outline", // Light rain
      "7": "rainy-outline", // Rain
      "8": "thunderstorm-outline", // Heavy rain
      "9": "thunderstorm-outline", // Thunderstorm
      "10": "snow-outline", // Light snow
      "11": "snow-outline", // Snow
      "12": "snow-outline", // Heavy snow
      "13": "snow-outline", // Sleet
    };

    return iconMap[symbol] || "cloudy-outline";
  };

  // Charts Section
  const ChartPeriodSelector = () => {
      return (
      <View style={styles.periodSelectorContainer}>
        <TouchableOpacity
          style={[
            styles.periodButton,
            selectedChartPeriod === "day" && styles.periodButtonActive,
          ]}
          onPress={() => setSelectedChartPeriod("day")}
        >
          <ThemedText
            style={[
              styles.periodButtonText,
              selectedChartPeriod === "day" && styles.periodButtonTextActive,
            ]}
          >
            Day
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.periodButton,
            selectedChartPeriod === "week" && styles.periodButtonActive,
          ]}
          onPress={() => setSelectedChartPeriod("week")}
        >
          <ThemedText
            style={[
              styles.periodButtonText,
              selectedChartPeriod === "week" && styles.periodButtonTextActive,
            ]}
          >
            Week
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.periodButton,
            selectedChartPeriod === "month" && styles.periodButtonActive,
          ]}
          onPress={() => setSelectedChartPeriod("month")}
        >
          <ThemedText
            style={[
              styles.periodButtonText,
              selectedChartPeriod === "month" && styles.periodButtonTextActive,
            ]}
          >
            Month
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.periodButton,
            selectedChartPeriod === "year" && styles.periodButtonActive,
          ]}
          onPress={() => setSelectedChartPeriod("year")}
        >
          <ThemedText
            style={[
              styles.periodButtonText,
              selectedChartPeriod === "year" && styles.periodButtonTextActive,
            ]}
          >
            Year
          </ThemedText>
        </TouchableOpacity>
      </View>
    );
  };

  // Simplified Energy Chart Component that works for all time periods
  const EnergyChart = () => {
    const screenWidth = Dimensions.get("window").width - 40; // Accounting for margins

    if (chartLoading) {
      return (
        <View style={styles.chartLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText style={styles.chartLoadingText}>
            Loading chart data...
          </ThemedText>
        </View>
      );
    }

    if (
      !energyHistData ||
      !energyHistData.data ||
      energyHistData.data.length === 0
    ) {
      return (
        <View style={styles.chartNoDataContainer}>
          <Ionicons
            name="bar-chart-outline"
            size={48}
            color={isDarkMode ? "#888" : "#aaaaaa"}
          />
          <ThemedText style={styles.chartNoDataText}>
            No energy data available for this period
          </ThemedText>
        </View>
      );
    }

    // Sort data by date to ensure chronological order
    const sortedData = [...energyHistData.data].sort(
      (a, b) =>
        new Date(a.logDateTime).getTime() - new Date(b.logDateTime).getTime()
    );

    // Format labels based on period type
    const getFormattedLabel = (
      dateStr: string,
      index: number,
      total: number
    ) => {
      const date = new Date(dateStr);

      // Skip some labels for better spacing when we have many data points
      if (total > 12 && index % Math.ceil(total / 6) !== 0) {
        return "";
        }

        if (selectedChartPeriod === "day") {
        // Format for more granular time data in day view (hh:mm format)
        const hours = date.getHours();
        const minutes = date.getMinutes();
        // Show hours with leading zero and only show minutes if non-zero
        return (
          hours.toString().padStart(2, "0") +
          (minutes > 0 ? `:${minutes.toString().padStart(2, "0")}` : "")
        );
      } else if (selectedChartPeriod === "week") {
        return date.getDate() + "/" + (date.getMonth() + 1);
      } else if (selectedChartPeriod === "month") {
        return date.getDate() + "/" + (date.getMonth() + 1);
      } else {
        // year
        return date.toLocaleString("default", { month: "short" });
        }
    };

    // Process data for the chart
    const validData = sortedData.filter(
      (item) => !isNaN(new Date(item.logDateTime).getTime())
    );

    const chartData = {
      labels: validData.map((item, index) =>
        getFormattedLabel(item.logDateTime, index, validData.length)
      ),
      datasets: [
        {
          data: validData.map((item) => {
            const value = findChannelValue(
              item.channels,
              "EnergyProductionTotal"
            );

            // For day view with historical data, we should properly handle the values
            if (selectedChartPeriod === "day" && value !== null) {
              // Historical data might be in Wh, convert to kWh
              return Math.max(0, value / 1000);
            } else if (value !== null) {
              // For other periods, use the existing conversion
              return Math.max(0, value / 1000); // Convert to kWh
            } else {
              return 0;
            }
          }),
          color: (opacity = 1) => `rgba(66, 133, 244, ${opacity})`, // Line color
          strokeWidth: 2.5,
          // Add dots for fewer data points, hide them when there are many
          withDots: validData.length <= 31,
        },
      ],
    };

    const chartConfig = {
      backgroundGradientFrom: isDarkMode ? colors.card : "#fff",
      backgroundGradientTo: isDarkMode ? colors.card : "#fff",
      decimalPlaces: 1,
      color: (opacity = 1) => `rgba(66, 133, 244, ${opacity})`,
      labelColor: (opacity = 1) =>
        isDarkMode
          ? `rgba(255, 255, 255, ${opacity})`
          : `rgba(0, 0, 0, ${opacity})`,
      propsForLabels: {
        fontSize: 10,
        fontWeight: "400",
      },
      propsForBackgroundLines: {
        strokeDasharray: "",
        stroke: isDarkMode ? `rgba(255, 255, 255, 0.1)` : `rgba(0, 0, 0, 0.1)`,
        strokeWidth: 1,
      },
      propsForDots: {
        r: validData.length > 31 ? "0" : "3",
        strokeWidth: "2",
        stroke: "rgba(66, 133, 244, 0.8)",
      },
      formatYLabel: (value: string) => {
        const num = parseFloat(value);
        return num < 10 ? num.toFixed(1) : Math.round(num).toString();
      },
      style: {
        borderRadius: 16,
      },
      formatXLabel: (label: string) => label,
    };

    // Determine chart title based on period
    const chartTitle =
      selectedChartPeriod === "day"
        ? "Daily Energy Production (kWh)"
        : selectedChartPeriod === "week"
        ? "Weekly Energy Production (kWh)"
        : selectedChartPeriod === "month"
        ? "Monthly Energy Production (kWh)"
        : "Yearly Energy Production (kWh)";

    return (
      <View style={styles.chartContainer}>
        <View style={styles.chartHeader}>
          <ThemedText style={styles.chartTitle}>{chartTitle}</ThemedText>
          </View>
        <LineChart
          data={chartData}
          width={screenWidth}
          height={220}
          chartConfig={chartConfig}
          bezier
          style={styles.chart}
          withVerticalLines={validData.length <= 31}
          withHorizontalLines={true}
          fromZero={true}
          yAxisSuffix=" kWh"
          withInnerLines={true}
          segments={5}
          yAxisInterval={1}
        />
      </View>
    );
  };

  // Device Card Component
  const DeviceCard = ({
    device,
    index,
  }: {
    device: api.DeviceMetadata;
    index: number;
  }) => {
    const systemIdParam =
      pvSystemId && typeof pvSystemId === "string" ? pvSystemId : "";

    return (
      <Animated.View
        entering={FadeInUp.delay(300 + index * 100).springify()}
        style={styles.deviceCardContainer}
      >
        <Card
          style={[
            styles.deviceCard,
            { backgroundColor: isDarkMode ? colors.card : "#fff" },
          ]}
          onPress={() => {
            Alert.alert(
              "View Device Details",
              `Would navigate to details for ${
                device.deviceName || device.deviceType
              } (ID: ${device.deviceId})`,
              [{ text: "OK" }]
            );
          }}
        >
          <Card.Content>
            <View style={styles.deviceHeader}>
              <View style={styles.deviceNameContainer}>
                <ThemedText
                  style={styles.deviceName}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {device.deviceName || `(${device.deviceType})`}
                </ThemedText>
                <Chip
                  style={[
                    styles.deviceStatusChip,
                    {
                      backgroundColor: device.isActive
                        ? "#34C759" + "22"
                        : "#FF3B30" + "22",
                    },
                  ]}
                  textStyle={{
                    color: device.isActive ? "#34C759" : "#FF3B30",
                    fontWeight: "600",
                    fontSize: 12,
                  }}
                >
                  {device.isActive ? "ACTIVE" : "INACTIVE"}
                </Chip>
              </View>
            </View>

            <ThemedText style={styles.deviceType} numberOfLines={1}>
              Type: {device.deviceType}
            </ThemedText>

            <ThemedText style={styles.deviceDate} numberOfLines={1}>
              Installed: {formatDate(device.activationDate)}
            </ThemedText>

            <Divider style={{ marginVertical: 12 }} />

            <View style={styles.deviceFooter}>
              <ThemedText style={styles.deviceViewDetails}>
                View Details
              </ThemedText>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.primary}
              />
            </View>
          </Card.Content>
        </Card>
      </Animated.View>
    );
  };

  // --- Render Dashboard ---
  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        { backgroundColor: isDarkMode ? colors.background : "#f5f5f5" },
      ]}
      edges={["top", "left", "right"]}
    >
      {/* Configure Header Title Dynamically */}
      <Stack.Screen
        options={{
          title: pvSystemDetails.name || "System Details",
          headerStyle: {
            backgroundColor: isDarkMode ? colors.background : "#f5f5f5",
          },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerRight: () =>
            demoMode ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ color: "#FF9800", marginRight: 8 }}>
                  Demo Mode
                </Text>
                <TouchableOpacity onPress={toggleDemoMode}>
                  <LocalIonicon
                    name="bug"
                    size={24}
                    color="#FF9800"
                    style={{ marginRight: 16 }}
                  />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={toggleDemoMode}>
                <LocalIonicon
                  name="bug-outline"
                  size={24}
                  color={colors.text}
                  style={{ marginRight: 16 }}
                />
              </TouchableOpacity>
            ),
        }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* --- Header --- */}
        <Animated.View entering={FadeInDown.springify()}>
          <View style={styles.header}>
            <View style={styles.statusContainer}>
              <View
                style={[
                  styles.statusIndicator,
                  { backgroundColor: systemStatusColor },
                ]}
              />
              <ThemedText style={styles.statusText}>
                {systemIsOnline ? "Online" : "Offline"}
              </ThemedText>
            </View>
          </View>

          {/* --- Image --- */}
          <View style={styles.imageContainer}>
            {pvSystemDetails.pictureURL ? (
              <Image
                source={{ uri: pvSystemDetails.pictureURL }}
                style={styles.image}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.placeholderImage,
                  { backgroundColor: isDarkMode ? colors.card : "#e0e0e0" },
                ]}
              >
                <Ionicons
                  name="image-outline"
                  size={64}
                  color={isDarkMode ? "#555" : "#999"}
                />
              </View>
            )}
          </View>
        </Animated.View>

        {/* --- System Dashboard Section --- */}
        <Animated.View
          entering={FadeInUp.delay(100).springify()}
          style={[
            styles.section,
            { backgroundColor: isDarkMode ? colors.card : "#fff", padding: 16 },
          ]}
        >
          <ThemedText style={styles.sectionTitle}>System Dashboard</ThemedText>

          {/* Period selector above the cards */}
          <DashboardPeriodIndicator />

          <FlatList
            ref={dashboardFlatListRef}
            data={dashboardData}
            renderItem={renderDashboardCard}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const contentOffset = event.nativeEvent.contentOffset;
              const viewSize = event.nativeEvent.layoutMeasurement;
              const pageNum = Math.floor(contentOffset.x / viewSize.width);
              setSelectedDashboardPeriod(
                dashboardData[pageNum].id as "today" | "week" | "month" | "year"
              );
            }}
          />
        </Animated.View>

        {/* Weather Widget */}
        <WeatherWidget />

        {/* Charts Section */}
        <Animated.View
          entering={FadeInUp.delay(250).springify()}
          style={[
            styles.section,
            { backgroundColor: isDarkMode ? colors.card : "#fff" },
          ]}
        >
          <ThemedText style={styles.sectionTitle}>
            Performance Trends
          </ThemedText>
          <ChartPeriodSelector />

          {/* Energy chart adapts based on selected period */}
          <EnergyChart />
        </Animated.View>

        {/* --- Devices Section --- */}
        <Animated.View
          entering={FadeInUp.delay(300).springify()}
          style={[
            styles.section,
            { backgroundColor: isDarkMode ? colors.card : "#fff" },
          ]}
        >
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Devices</ThemedText>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  "View All Devices",
                  `Would navigate to all devices for ${
                    pvSystemDetails?.name || "this system"
                  }`,
                  [{ text: "OK" }]
                );
              }}
              style={styles.viewAllButton}
            >
              <ThemedText style={{ color: colors.primary }}>
                View All
              </ThemedText>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {devices.length > 0 ? (
            <View>
              {devices.slice(0, 3).map((device, index) => (
                <DeviceCard
                  key={device.deviceId}
                  device={device}
                  index={index}
                />
              ))}

              {devices.length > 3 && (
                <ThemedText style={styles.moreDevicesText}>
                  {devices.length - 3} more devices available
                </ThemedText>
              )}
            </View>
          ) : (
            <ThemedText style={styles.noDataText}>
              No devices found for this system.
            </ThemedText>
          )}
        </Animated.View>

        {/* --- Maintenance Log Section --- */}
        <Animated.View
          entering={FadeInUp.delay(400).springify()}
          style={[
            styles.section,
            { backgroundColor: isDarkMode ? colors.card : "#fff" },
          ]}
        >
          <ThemedText style={styles.sectionTitle}>Maintenance Log</ThemedText>
          <ThemedText style={styles.noDataText}>
            Maintenance logs are not available for this system at the moment.
          </ThemedText>
        </Animated.View>

        {/* --- Basic System Info Section --- */}
        <Animated.View
          entering={FadeInUp.delay(500).springify()}
          style={[
            styles.section,
            { backgroundColor: isDarkMode ? colors.card : "#fff" },
          ]}
        >
          <ThemedText style={styles.sectionTitle}>
            System Information
          </ThemedText>
          <View style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>ID:</ThemedText>
            <ThemedText style={styles.infoValue}>
              {pvSystemDetails.pvSystemId}
            </ThemedText>
          </View>
          <View style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>Installation:</ThemedText>
            <ThemedText style={styles.infoValue}>
              {formatDate(pvSystemDetails.installationDate)}
            </ThemedText>
          </View>
          <View style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>Last Import:</ThemedText>
            <ThemedText style={styles.infoValue}>
              {formatDateTime(pvSystemDetails.lastImport)}
            </ThemedText>
          </View>
          <View style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>Time Zone:</ThemedText>
            <ThemedText style={styles.infoValue}>
              {pvSystemDetails.timeZone}
            </ThemedText>
          </View>
        </Animated.View>

        {/* --- Location Section --- */}
        <Animated.View
          entering={FadeInUp.delay(600).springify()}
          style={[
            styles.section,
            { backgroundColor: isDarkMode ? colors.card : "#fff" },
          ]}
        >
          <ThemedText style={styles.sectionTitle}>Location</ThemedText>
          <View style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>Street:</ThemedText>
            <ThemedText style={styles.infoValue}>
              {pvSystemDetails.address.street ?? "N/A"}
            </ThemedText>
          </View>
          <View style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>City:</ThemedText>
            <ThemedText style={styles.infoValue}>
              {pvSystemDetails.address.city ?? "N/A"}
            </ThemedText>
          </View>
          <View style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>Zip Code:</ThemedText>
            <ThemedText style={styles.infoValue}>
              {pvSystemDetails.address.zipCode ?? "N/A"}
            </ThemedText>
          </View>
          <View style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>State:</ThemedText>
            <ThemedText style={styles.infoValue}>
              {pvSystemDetails.address.state ?? "N/A"}
            </ThemedText>
          </View>
          <View style={styles.infoItem}>
            <ThemedText style={styles.infoLabel}>Country:</ThemedText>
            <ThemedText style={styles.infoValue}>
              {pvSystemDetails.address.country ?? "N/A"}
            </ThemedText>
          </View>
        </Animated.View>

        {/* --- Error Messages Section (Conditional) --- */}
        {(latestErrorMessages.length > 0 || demoMode) && (
          <ThemedView
            type="card"
            style={[styles.section, { backgroundColor: colors.card }]}
          >
            <View style={styles.sectionHeader}>
              <LocalIonicon
                name="warning"
                size={24}
                color={statusColors.warning}
              />
              <ThemedText
                type="subtitle"
                style={[styles.sectionTitle, { color: statusColors.warning }]}
              >
                System Errors{" "}
                {latestErrorMessages.length > 0
                  ? `(${latestErrorMessages.length})`
                  : ""}
              </ThemedText>

              {demoMode && (
                <TouchableOpacity
                  style={styles.demoButton}
                  onPress={addDemoErrorMessage}
                >
                  <ThemedText type="caption" style={{ color: "#FF9800" }}>
                    + Add Demo Error
                  </ThemedText>
                </TouchableOpacity>
              )}
            </View>

            {latestErrorMessages.length > 0 ? (
              latestErrorMessages.map((msg, idx) => (
                <View
                  key={`error-${idx}`}
                  style={[
                    styles.errorItem,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View style={styles.errorHeader}>
                    <LocalIonicon
                      name="alert-circle"
                      size={16}
                      color={statusColors.warning}
                    />
                    <ThemedText type="error" style={styles.errorItemTitle}>
                      {msg.text || "Unknown Error"}
                    </ThemedText>
                  </View>

                  <View style={styles.errorDetails}>
                    <View style={styles.errorDetail}>
                      <ThemedText
                        type="caption"
                        style={styles.errorDetailLabel}
                      >
                        Error Code:
                      </ThemedText>
                      <ThemedText
                        type="caption"
                        style={styles.errorDetailValue}
                      >
                        {msg.stateCode || "N/A"}
                      </ThemedText>
                    </View>

                    <View style={styles.errorDetail}>
                      <ThemedText
                        type="caption"
                        style={styles.errorDetailLabel}
                      >
                        Device ID:
                      </ThemedText>
                      <ThemedText
                        type="caption"
                        style={styles.errorDetailValue}
                      >
                        {msg.deviceId || "System Level"}
                      </ThemedText>
                    </View>

                    <View style={styles.errorDetail}>
                      <ThemedText
                        type="caption"
                        style={styles.errorDetailLabel}
                      >
                        Type:
                      </ThemedText>
                      <ThemedText
                        type="caption"
                        style={styles.errorDetailValue}
                      >
                        {msg.stateType || "Unknown"}
                      </ThemedText>
                    </View>
                  </View>

                  <ThemedText type="caption" style={styles.errorTimestamp}>
                    {formatDateTime(msg.logDateTime)}
                  </ThemedText>
                </View>
              ))
            ) : demoMode ? (
              <View style={styles.emptyErrorState}>
                <ThemedText type="caption">
                  No errors found. Add a demo error using the button above.
                </ThemedText>
              </View>
            ) : null}
          </ThemedView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Styles (Combined and refined from previous examples) ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  imageContainer: {
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    marginHorizontal: 16,
    marginBottom: 16,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholderImage: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  weatherCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 30,
    borderRadius: 12, // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  kpiContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 5,
  },
  kpiItem: {
    width: "45%",
    paddingVertical: 10,
    paddingHorizontal: 3,
    marginBottom: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  kpiLabel: {
    fontSize: 13,
    marginBottom: 4,
    opacity: 0.7,
    textAlign: "center",
    width: "100%",
    flexShrink: 1,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    width: "100%",
    flexShrink: 1,
  },
  weatherMainContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 8,
  },

  weatherNoDataContent: {
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  weatherIconContainer: {
    marginRight: 12,
  },
  weatherDataContainer: {
    flex: 1,
  },
  weatherTemperature: {
    fontSize: 26,
    fontWeight: "bold",
  },
  weatherCondition: {
    fontSize: 16,
    opacity: 0.8,
  },
  weatherDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  weatherDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
    marginBottom: 4,
  },
  weatherDetailText: {
    marginLeft: 6,
    opacity: 0.7,
  },
  weatherUpdated: {
    fontSize: 12,
    textAlign: "right",
  },
  deviceCardContainer: {
    marginBottom: 12,
  },
  deviceCard: {
    borderRadius: 10,
    overflow: "hidden",
  },
  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  deviceNameContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deviceName: {
    fontWeight: "bold",
    fontSize: 16,
    marginRight: 8,
    flex: 1,
  },
  deviceStatusChip: {
    height: 26,
    borderRadius: 13,
  },
  deviceType: {
    opacity: 0.7,
    fontSize: 14,
    marginBottom: 4,
  },
  deviceDate: {
    opacity: 0.7,
    fontSize: 14,
  },
  deviceFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  deviceViewDetails: {
    fontSize: 14,
    marginRight: 4,
    opacity: 0.8,
  },
  moreDevicesText: {
    textAlign: "center",
    opacity: 0.6,
    marginTop: 8,
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
  },
  errorText: {
    fontSize: 16,
    color: "#FF3B30",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  infoItem: {
    flexDirection: "row",
    marginBottom: 10,
  },
  infoLabel: {
    fontWeight: "600",
    width: 110,
    opacity: 0.8,
  },
  infoValue: {
    flex: 1,
    opacity: 0.7,
  },
  noDataText: {
    opacity: 0.7,
    textAlign: "center",
    paddingVertical: 16,
  },
  backButtonContainer: {
    padding: 8,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  accessDeniedSubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  demoButton: {
    marginLeft: "auto",
    backgroundColor: "rgba(255,152,0,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  errorItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  errorHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  errorItemTitle: {
    fontWeight: "bold",
    marginLeft: 8,
  },
  errorDetails: {
    marginTop: 4,
    marginLeft: 24,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 4,
    padding: 8,
  },
  errorDetail: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  errorDetailLabel: {
    fontWeight: "bold",
    flex: 1,
  },
  errorDetailValue: {
    flex: 2,
  },
  errorTimestamp: {
    fontSize: 12,
    opacity: 0.5,
    textAlign: "right",
  },
  emptyErrorState: {
    padding: 16,
    alignItems: "center",
  },
  // Chart Styles
  chartLoadingContainer: {
    height: 220,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 16,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 8,
  },
  chartLoadingText: {
    marginTop: 10,
    fontSize: 14,
    opacity: 0.7,
  },
  chartNoDataContainer: {
    height: 220,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 16,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 8,
  },
  chartNoDataText: {
    marginTop: 10,
    fontSize: 14,
    opacity: 0.7,
    textAlign: "center",
  },
  chartContainer: {
    backgroundColor: "transparent",
    borderRadius: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  chart: {
    marginVertical: 8,
    borderRadius: 8,
  },
  periodSelectorContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 12,
    marginTop: 4,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 8,
  },
  periodButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginHorizontal: 5,
  },
  periodButtonActive: {
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  periodButtonText: {
    fontSize: 13,
  },
  periodButtonTextActive: {
    fontWeight: "bold",
  },
  dashboardCardHeader: {
    marginBottom: 12,
  },
  dashboardCardTitle: {
    fontSize: 18,
    fontWeight: "500",
    textAlign: "center",
    marginVertical: 8,
  },
  weatherHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  weatherMainInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  assessmentBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  assessmentText: {
    fontSize: 13,
    fontWeight: "bold",
  },
  weatherGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  weatherGridItem: {
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  weatherGridLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
    width: 90,
    flexShrink: 0,
  },
  weatherGridValue: {
    fontSize: 14,
    flexShrink: 1,
    overflow: "hidden",
  },
});
