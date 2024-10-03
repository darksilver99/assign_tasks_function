const functions = require("firebase-functions");
const admin = require("firebase-admin");
const request = require('request');
const axios = require('axios');
const formData = require("form-data");

const REGION = "asia-east1";

admin.initializeApp();
const db = admin.firestore();
const storage = admin.storage();

const line_token = "mutXsXdF95oc9WHAaWm7DwAPQfQ65Cn9x9uz8E6sZad";

function isEmpty(checkValue) {
    if (checkValue === undefined || checkValue === null || checkValue === "" || checkValue + "" === "null") {
        return true;
    }
    return false;
}

exports.helloWorld = functions.region(REGION).https
    .onRequest((request, response) => {
        let provinces = [];
        for (let i = 0; i < 15; i++) {
            provinces[i] = 'กทม' + i;
        }
        response.json({ status: true, data: provinces });
    });

// customer_name/6RKQmemieO7y4VkbqRVU/task_list/B7bpZFwQvHtA3RpiUoWl/worker_list/AvXUrwlHJEq5IQ9PoIDn
exports.onCreateWokerList = functions.firestore.document('customer_name/{customer_id}/task_list/{task_id}/worker_list/{worker_id}')
    .onCreate(async (snap, context) => {

        const original = snap.data();
        const customer_id = context.params.customer_id;
        const task_id = context.params.task_id;
        const worker_id = context.params.worker_id;

        const doc_path = "customer_name/" + customer_id + "/task_list/" + task_id + "/worker_id/" + worker_id;

        const data = {
            "create_date": new Date(),
            "subject": "มีงานใหม่กรุณาตรวจสอบ",
            "detail": "",
            "receiver": original.member_ref,
            "type": "new_work",
            "doc_path": doc_path,
        };
        db.collection("customer_name/" + customer_id + "/notification_list").add(data);

    });

exports.onCreateNotification = functions.firestore.document('customer_name/{customer_id}/notification_list/{notification_id}')
    .onCreate(async (snap, context) => {
        const original = snap.data();
        const customer_id = context.params.customer_id;
        const notification_id = context.params.notification_id;


        const token = await getTokenByMemberRef(original.receiver);

        if (isEmpty(token)) {
            return;
        }

        console.log("token");
        console.log(token);

        const payload = {
            notification: {
                title: original.subject,
                body: original.detail,
            },
            data: {
                click_action: "FLUTTER_NOTIFICATION_CLICK",
                id: "high_importance_channel",
                status: "done",
                sound: "default",
                title: original.subject,
                body: "",
                type: original.type
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        contentAvailable: true,
                    },
                },
                headers: {
                    'apns-priority': '10',
                },
            },
            android: {
                priority: 'high',
            },
            token: token,
        };

        admin
            .messaging()
            .send(payload);

    });

async function getTokenByMemberRef(member_ref) {

    const rsMember = await db.doc(member_ref.path).get();

    if (isEmpty(rsMember.data())) {
        return '';
    }

    const rs = await db.doc(rsMember.data()["create_by"].path).get();
    if (isEmpty(rs.data()["firebase_token"])) {
        return '';
    }

    return rs.data()["firebase_token"];
}

exports.onWriteUsers = functions.firestore.document('users/{user_id}')
    .onWrite(async (snap, context) => {

        const before = snap.before.data();
        const original = snap.after.data();
        const user_id = context.params.user_id;

        if (isEmpty(before)) {
            return;
        }

        if (isEmpty(original)) {
            return;
        }

        if (isEmpty(before.phone_number)) {
            let message = "มีการสมัครสมาชิกใหม่จากคุณ ";
            message = message + original.full_name + " (" + original.display_name + ")";
            message = message + "\n" + "เบอร์โทร : " + original.phone_number;
            message = message + "\n" + "อีเมล : " + original.email;
            sendLineNotify(message, line_token);
        }



    });

exports.onCreateIssueList = functions.firestore.document('issue_list/{doc_id}')
    .onCreate(async (snap, context) => {

        const original = snap.data();
        const doc_id = context.params.doc_id;

        let message = "มีการแจ้งปัญหาการใช้งานจากคุณ ";
        message = message + original.contact_name;
        message = message + "\n" + "เบอร์โทร : " + original.contact_phone;
        message = message + "\n" + "หัวข้อ : " + original.subject;
        message = message + "\n" + "รายละเอียด : " + original.detail;
        sendLineNotify(message, line_token);

    });

exports.onCreateSuggestList = functions.firestore.document('suggest_list/{doc_id}')
    .onCreate(async (snap, context) => {

        const original = snap.data();
        const doc_id = context.params.doc_id;

        let message = "มีข้อเสนอแนะ ";
        message = message + original.subject;
        message = message + "\n" + "รายละเอียด : " + original.detail;
        sendLineNotify(message, line_token);

    });


exports.onCreatePaymentList = functions.firestore.document('payment_list/{doc_id}')
    .onCreate(async (snap, context) => {

        const original = snap.data();
        const doc_id = context.params.doc_id;

        let message = "มีการแจ้งโอนเงินจาก ";
        message = message + original.customer_name + "(" + original.customer_ref.id + ")";
        message = message + "\n" + "รูปหลักฐานการโอนเงิน : ";
        sendLineNotify(message, line_token, original.image_slip, original.image_slip);

    });

function sendLineNotify(message, token, image1, image2) {

    // image1,2 is url path

    const data = new formData();
    data.append("message", message);

    if (!isEmpty(image1) && !isEmpty(image2)) {
        data.append("imageThumbnail", image1);
        data.append("imageFullsize", image2);
    }

    const config = {
        method: "post",
        maxBodyLength: Infinity,
        url: "https://notify-api.line.me/api/notify",
        headers: {
            "content-type": "application/json",
            "Authorization": "Bearer " + token,
            ...data.getHeaders(),
        },
        data: data,
    };

    axios.request(config);
}
