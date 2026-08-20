const Downtime = require("../models/Downtime");
const Device = require("../models/Device");

const maintenanceTimers = new Map();

function getDowntimeStatus(start, end) {
    const now = new Date();

    if (now < start) {
        return "scheduled";
    }

    if (now >= start && now <= end) {
        return "active";
    }

    return "expired";
}


// ======================================================
// CREATE DOWNTIME
// ======================================================
async function createDowntime(data) {

    const {
        device_id,
        downtime_start,
        downtime_end,
        reason,
        initiated_by,
        created_by,
        notes
    } = data;

    if (!Array.isArray(device_id) || device_id.length === 0) {
        throw new Error("device_id must be a non-empty array");
    }

    const start = new Date(downtime_start);
    const end = new Date(downtime_end);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error("Invalid downtime_start or downtime_end");
    }

    if (end <= start) {
        throw new Error(
            "downtime_end must be greater than downtime_start"
        );
    }

    const devices = await Device.find({
        _id: { $in: device_id }
    });

    if (devices.length !== device_id.length) {
        throw new Error("One or more devices not found");
    }

    const records = device_id.map(id => ({
        device_id: id,
        downtime_start: start,
        downtime_end: end,
        reason: reason || "",
        initiated_by: initiated_by || "",
        created_by: created_by || "",
        notes: notes || null
    }));

    const created = await Downtime.insertMany(records);

    // await Device.updateMany(
    //     {
    //         _id: {
    //             $in: device_id
    //         }
    //     },
    //     {
    //         $set: {
    //             maintenanceMode: "Active"
    //         }
    //     }
    // );

    for (const record of created) {
        await syncDeviceMaintenanceMode(record.device_id);
        scheduleMaintenanceExpiry(record);
    }

    return created;
}


// ======================================================
// LIST DOWNTIME
// ======================================================
async function getDowntimes(deviceId) {

    const query = {};

    if (deviceId) {
        query.device_id = deviceId;
    }

    const downtimes = await Downtime.find(query)
        .sort({ downtime_start: 1 })
        .populate("device_id", "ip deviceName")
        .lean();

    const data = downtimes.map(item => ({
        downtime_id: item._id,

        device_id:
            item.device_id?._id || item.device_id,

        downtime_start:
            item.downtime_start,

        downtime_end:
            item.downtime_end,

        reason:
            item.reason,

        initiated_by:
            item.initiated_by,

        downtime_status:
            getDowntimeStatus(
                new Date(item.downtime_start),
                new Date(item.downtime_end)
            ),

        created_by:
            item.created_by,

        created_at:
            item.createdAt,

        updated_at:
            item.updatedAt,

        notes:
            item.notes
    }));

    return {
        data,
        count: data.length
    };
}


// ======================================================
// EDIT DOWNTIME
// ======================================================
async function updateDowntime(id, data) {

    const downtime = await Downtime.findById(id);

    if (!downtime) {
        throw new Error("Downtime not found");
    }

    // const now = new Date();

    const currentStatus = getDowntimeStatus(
        downtime.downtime_start,
        downtime.downtime_end
    );

    // Active downtime should not have its start/end modified.
    if (currentStatus === "active") {
        throw new Error(
            "Active downtime cannot be edited"
        );
    }

    if (data.downtime_start !== undefined) {
        downtime.downtime_start =
            new Date(data.downtime_start);
    }

    if (data.downtime_end !== undefined) {
        downtime.downtime_end =
            new Date(data.downtime_end);
    }

    if (downtime.downtime_end <= downtime.downtime_start) {
        throw new Error(
            "downtime_end must be greater than downtime_start"
        );
    }

    if (data.reason !== undefined) {
        downtime.reason = data.reason;
    }

    if (data.initiated_by !== undefined) {
        downtime.initiated_by = data.initiated_by;
    }

    if (data.notes !== undefined) {
        downtime.notes = data.notes;
    }

    await downtime.save();

    await syncDeviceMaintenanceMode(
        downtime.device_id
    );

    scheduleMaintenanceExpiry(downtime);

    return downtime;
}


// ======================================================
// DELETE DOWNTIME
// ======================================================
async function deleteDowntime(ids) {

    if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error("downtime_ids must be a non-empty array");
    }

    const affectedRecords = await Downtime.find({
        _id: { $in: ids }
    })
        .select("device_id")
        .lean();

    for (const id of ids) {

        const timer = maintenanceTimers.get(
            String(id)
        );

        if (timer) {
            clearTimeout(timer);

            maintenanceTimers.delete(
                String(id)
            );
        }
    }

    const result = await Downtime.deleteMany({
        _id: { $in: ids }
    });

    const deviceIds = [
        ...new Set(
            affectedRecords.map(item =>
                String(item.device_id)
            )
        )
    ];

    for (const deviceId of deviceIds) {
        await syncDeviceMaintenanceMode(deviceId);
    }

    return {
        deletedCount: result.deletedCount
    };
}

// STOP MAINTENANCE
async function stopMaintenance(deviceIds) {

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
        throw new Error("device_id must be a non-empty array");
    }

    const activeDowntimes = await Downtime.find({
        device_id: { $in: deviceIds },
        downtime_start: { $lte: new Date() },
        downtime_end: { $gte: new Date() }
    }).select("_id device_id");

    for (const downtime of activeDowntimes) {

        const timer = maintenanceTimers.get(
            String(downtime._id)
        );

        if (timer) {
            clearTimeout(timer);
            maintenanceTimers.delete(
                String(downtime._id)
            );
        }
    }

    await Device.updateMany(
        { _id: { $in: deviceIds } },
        {
            $set: {
                maintenanceMode: "Inactive"
            }
        }
    );

    return {
        success: true,
        deviceIds
    };
}


async function syncDeviceMaintenanceMode(deviceId) {
    const now = new Date();

    const activeDowntime = await Downtime.findOne({
        device_id: deviceId,
        downtime_start: { $lte: now },
        downtime_end: { $gte: now }
    }).lean();

    await Device.updateOne(
        { _id: deviceId },
        {
            $set: {
                maintenanceMode: activeDowntime
                    ? "Active"
                    : "Inactive"
            }
        }
    );

    return Boolean(activeDowntime);
}

// async function syncAllMaintenanceModes() {
//     try {
//         const deviceIds = await Downtime.distinct("device_id");

//         for (const deviceId of deviceIds) {
//             await syncDeviceMaintenanceMode(deviceId);
//         }
//     } catch (error) {
//         console.error(
//             "❌ Maintenance synchronization failed:",
//             error
//         );
//     }
// }

async function restoreMaintenanceTimers() {

    try {
        const now = new Date();

        const downtimes = await Downtime.find({
            downtime_end: { $gt: now }
        }).lean();

        for (const downtime of downtimes) {
            await syncDeviceMaintenanceMode(downtime.device_id);

            scheduleMaintenanceExpiry(downtime);
        }

        console.log(
            `🔄 Restored ${downtimes.length} maintenance timers`
        );

    } catch (error) {
        console.error(
            "❌ Failed to restore maintenance timers:",
            error
        );
    }
}

function scheduleMaintenanceExpiry(downtime) {
    const downtimeId = String(downtime._id);

    // Clear existing timer for this downtime
    if (maintenanceTimers.has(downtimeId)) {
        clearTimeout(maintenanceTimers.get(downtimeId));
        maintenanceTimers.delete(downtimeId);
    }

    const now = Date.now();
    const start = new Date(downtime.downtime_start).getTime();
    const end = new Date(downtime.downtime_end).getTime();

    // --------------------------------------------------
    // Downtime already expired
    // --------------------------------------------------
    if (end <= now) {
        return;
    }

    // --------------------------------------------------
    // Future downtime
    // --------------------------------------------------
    if (start > now) {

        const startTimer = setTimeout(async () => {

            try {
                await syncDeviceMaintenanceMode(
                    downtime.device_id
                );

                console.log(`🟢 Maintenance started: ${downtime.device_id}`);

                scheduleMaintenanceExpiry(downtime);

            } catch (error) {
                console.error(
                    "❌ Failed to start maintenance:",
                    error
                );
            }

        }, start - now);

        maintenanceTimers.set(downtimeId, startTimer);

        return;
    }

    // --------------------------------------------------
    // Already active → schedule expiry
    // --------------------------------------------------
    const expiryTimer = setTimeout(async () => {

        try {

            await syncDeviceMaintenanceMode(
                downtime.device_id
            );

            maintenanceTimers.delete(downtimeId);

            console.log(
                `🔴 Maintenance expired: ${downtime.device_id}`
            );

        } catch (error) {
            console.error(
                "❌ Failed to expire maintenance:",
                error
            );
        }

    }, end - now);

    maintenanceTimers.set(downtimeId, expiryTimer);
}

restoreMaintenanceTimers();

// setInterval(syncAllMaintenanceModes, 60 * 1000);


module.exports = {
    createDowntime,
    getDowntimes,
    updateDowntime,
    deleteDowntime,
    getDowntimeStatus,
    syncDeviceMaintenanceMode,
    stopMaintenance
};