const Alarm = require("../models/Alarm");
const Device = require("../models/Device");
const SensorReading = require("../models/SensorReading");

async function getAlarms(filters = {}) {
    const {
        acknowledgement_status,
        alert_type,
        start_time,
        end_time,
        device_id,
        page = 1,
        limit = 50
    } = filters;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);

    const query = {};

    // -----------------------------------------
    // Acknowledgement status
    // false = active
    // true  = cleared
    // -----------------------------------------
    if (acknowledgement_status !== undefined) {

        if (!["true", "false"].includes(String(acknowledgement_status))) {
            throw new Error(
                "acknowledgement_status must be true or false"
            );
        }

        query.acknowledgement_status =
            String(acknowledgement_status) === "true";
    }

    // -----------------------------------------
    // Alert type
    // true  = device alarm
    // false = service / metric alarm
    // -----------------------------------------
    if (alert_type !== undefined) {

        if (!["true", "false"].includes(String(alert_type))) {
            throw new Error(
                "alert_type must be true or false"
            );
        }

        query.alert_type =
            String(alert_type) === "true";
    }

    // -----------------------------------------
    // Device
    // -----------------------------------------
    if (device_id) {
        query.device_id = device_id;
    }

    // -----------------------------------------
    // Time range
    // -----------------------------------------
    if (start_time || end_time) {

        query.created_at = {};

        if (start_time) {

            const startDate = new Date(start_time);

            if (isNaN(startDate.getTime())) {
                throw new Error("Invalid start_time");
            }

            query.created_at.$gte = startDate;
        }

        if (end_time) {

            const endDate = new Date(end_time);

            if (isNaN(endDate.getTime())) {
                throw new Error("Invalid end_time");
            }

            query.created_at.$lte = endDate;
        }
    }

    const skip = (pageNumber - 1) * pageLimit;

    const [alarms, total] = await Promise.all([
        Alarm.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(pageLimit)
            .lean(),

        Alarm.countDocuments(query)
    ]);

    const data = alarms.map(alarm => ({
        alert_id: alarm.alert_id,
        device_id: alarm.device_id,
        device_ip: alarm.device_ip,
        alert_type: alarm.alert_type,
        alert_severity: alarm.alert_severity,
        created_at: alarm.created_at,
        last_hard_state_change: alarm.last_hard_state_change,
        resolved_at: alarm.resolved_at,
        value: alarm.value,
        reason: alarm.reason,
        acknowledgement_status: alarm.acknowledgement_status,
        service_name: alarm.service_name
    }));

    return {
        data,
        pagination: {
            page: pageNumber,
            limit: pageLimit,
            total,
            totalPages: Math.ceil(total / pageLimit)
        }
    };
}

// FETCH DEVICE WITH BATTERY BACKUP ALARM
async function getBatteryBackupAlarms() {

    const activeBatteryAlarms = await Alarm.find({
        service_name: "batteryBackup",
        resolved_at: null
    })
        .sort({ updatedAt: -1 })
        .lean();

    if (activeBatteryAlarms.length === 0) {
        return {
            count: 0,
            data: []
        };
    }

    // One active battery alarm per device
    const latestAlarmByIP = new Map();

    for (const alarm of activeBatteryAlarms) {

        if (!latestAlarmByIP.has(alarm.device_ip)) {
            latestAlarmByIP.set(
                alarm.device_ip,
                alarm
            );
        }
    }

    const ips = [
        ...latestAlarmByIP.keys()
    ];

    const devices = await Device.find({
        ip: { $in: ips }
    })
        .select(
            "ip deviceName deviceSerialNumber deviceStatus maintenanceMode"
        )
        .lean();

    const deviceMap = new Map(
        devices.map(device => [
            device.ip,
            device
        ])
    );

    const data = await Promise.all(
        ips.map(async (ip) => {

            const alarm = latestAlarmByIP.get(ip);
            const device = deviceMap.get(ip);

            if (!device) {
                return null;
            }

            const latestReading =
                await SensorReading.findOne({
                    ip
                })
                    .sort({ timestamp: -1 })
                    .select("batteryBackup timestamp")
                    .lean();

            return {
                device_id: device._id,
                device_ip: device.ip,
                device_name: device.deviceName,
                device_serial_number:
                    device.deviceSerialNumber,

                device_status:
                    device.deviceStatus,

                maintenance_mode:
                    device.maintenanceMode,

                battery_backup:
                    latestReading?.batteryBackup ?? null,

                alarm: {
                    key: "batteryBackup",
                    title: alarm.value || alarm.reason,
                    severity: alarm.alert_severity
                },

                timestamp:
                    latestReading?.timestamp ?? null
            };
        })
    );

    const validData = data.filter(Boolean);

    return {
        count: validData.length,
        data: validData
    };
}

module.exports = {
    getAlarms,
    getBatteryBackupAlarms
};