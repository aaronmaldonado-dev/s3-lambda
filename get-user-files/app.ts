import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import AWS from 'aws-sdk';

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const username = event.body ? JSON.parse(event.body).username : undefined;

    if (!username) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'username is required',
            }),
        };
    }

    const tableName = process.env.DYNAMODB_TABLE;

    if (!tableName) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'table name is not defined',
            }),
        };
    }

    const params = {
        TableName: tableName,
        Key: {
            username,
        },
    };

    try {
        const data = await dynamoDB.get(params).promise();

        if (!data.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    message: 'user not found',
                }),
            };
        }

        const user = data.Item;
        const bucket = process.env.S3_BUCKET;

        if (!bucket) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    message: 'bucket name is not defined',
                }),
            };
        }

        const s3Params = {
            Bucket: bucket,
            Prefix: `${user.center}/`,
        };

        const s3Data = await s3.listObjectsV2(s3Params).promise();

        if (!s3Data.Contents) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    message: 'files not found',
                }),
            };
        }

        const files = s3Data.Contents.filter((file) => file.Key !== `${user.center}/`);

        const signedUrls = files.map((file) => {
            const params = {
                Bucket: bucket,
                Key: file.Key,
                Expires: 60,
            };

            const signedUrl = s3.getSignedUrl('getObject', params);

            return {
                name: file.Key,
                url: signedUrl,
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                user,
                files: signedUrls,
            }),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'an error occurred:' + err,
            }),
        };
    }
};
