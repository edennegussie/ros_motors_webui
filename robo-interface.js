//Utility function. Builds a wrapper function around the given function and
//makes sure it is not invoked in shorter time intervals than 'millis'. The
//last call is guaranteed to make it after the timer goes out.
var limitCallRate = function(millis, func) {
  var timeout = null;
  var last_args = null;

  function fire() {
    timeout = null;
    if (last_args != null) {
      args = last_args;
      last_args = null;
      timeout = setTimeout(fire, millis);
      func.apply(null, args); //Apply the last saved arguments
    }
  }

  return function() {
    last_args = arguments;
    if (timeout == null) {
      fire();
    }
  };
}

//Main Class
var RoboInterface = {

  $: $({}), //Event proxy. Events are triggered and bound to this object.

  //Keeps the incomming motor messages from flooding.
  sendMotorCmd: limitCallRate(30, function() {
    RoboInterface._sendMotorCmd.apply(RoboInterface, arguments);
  }),

  _sendMotorCmd: function(confEntry, angle, speed, acc) {
    var cmd = new ROSLIB.Message({
      id: confEntry.motorid,
      angle: Math.min(Math.max(angle, confEntry.min), confEntry.max),
      speed: speed || confEntry.speed,
      acceleration: acc || confEntry.acceleration
    });
    RoboInterface.motorCmdTopic.publish(cmd);
  },

  sendDefaultMotorCmds: function() {
    for (var i = 0; i < this.motorConf.length; i++) {
      this._sendMotorCmd(this.motorConf[i], this.motorConf[i].default);
    };
    this.pointHead();
  },

  getValidFaceExprs: function(callback) {
    this.validFaceExprsClient.callService(
      new ROSLIB.ServiceRequest(),
      callback
    );
  },

  makeFaceExpr: function(faceStr, intensity) {
    this.makeFaceExprTopic.publish(
      new ROSLIB.Message({
        exprname:faceStr,
        intensity:intensity
      })
    );
  },

  //Keeps the incomming motor messages from flooding.
  pointHead: limitCallRate(30, function() {
    RoboInterface._pointHead.apply(RoboInterface, arguments);
  }),

  _pointHead: function(new_angles){
    var angles = {yaw: 0, pitch: 0, roll: 0};

    this._pointHead = function(new_angles) {
      $.extend(angles, new_angles);
      RoboInterface.pointHeadTopic.publish(
        new ROSLIB.Message(angles)
      );
    };

    return this._pointHead(new_angles);
  },

  //Loads the config file and connects to ROS
  connect: function(address) {

    function connectROS() {
      //Connect to rosbridge
      ros = new ROSLIB.Ros({
        url: address
      }).on("connection", function(e){
        RoboInterface.$.trigger("connection");
      }).on("error", function(e){
        RoboInterface.$.trigger("error");
      });

      //Publish topic
      RoboInterface.motorCmdTopic = new ROSLIB.Topic({
        ros:ros,
        name:'/cmd_pololu',
        messageType:'ros_pololu_servo/servo_pololu'
      });
      RoboInterface.makeFaceExprTopic = new ROSLIB.Topic({
        ros:ros,
        name:'/make_face_expr',
        messageType:'basic_head_api/MakeFaceExpr'
      });
      RoboInterface.pointHeadTopic = new ROSLIB.Topic({
        ros:ros,
        name:'/point_head',
        messageType:'basic_head_api/PointHead'
      });
      RoboInterface.orchSwitchTopic = new ROSLIB.Topic({
        ros:ros,
        name:'/orch_switch',
        messageType:'std_msgs/String'
      });
      RoboInterface.cmdSpeakTopic = new ROSLIB.Topic({
        ros:ros,
        name:'/cmd_speak',
        messageType:'std_msgs/String'
      });

      //Subscribe to topics
      RoboInterface.motorCmdTopic.subscribe(function(msg) {
        RoboInterface.$.trigger("onMotorCmd", {
          msg: msg,
          confEntry: getConfFromID(msg.id)
        });
      });
      new ROSLIB.Topic({
        ros:ros,
        name:'/orch_switched',
        messageType:'std_msgs/String'
      }).subscribe(function(msg) {
        RoboInterface.$.trigger("onOrchSwitched", msg);
      });

      //Set up services
      RoboInterface.validFaceExprsClient = new ROSLIB.Service({
        ros:ros,
        name:'/valid_face_exprs',
        serviceType:'basic_head_api/ValidFaceExprs'
      });
    };
    this.$.on("configload", connectROS);

    $.ajax({
        url: "config.yaml",
        dataType: "text",
        success: function(data) {
          RoboInterface.motorConf = jsyaml.load(data);
          RoboInterface.$.trigger("configload");
        }
    });

    return this;
  },
};

//Utility function
var getConfFromID = (function() {
  var motorID2Conf = {};

  RoboInterface.$.on("configload", function() {
    var motorConf = RoboInterface.motorConf;
    for (var i = 0; i < motorConf.length; i++) {
      motorID2Conf[motorConf[i].motorid] = motorConf[i];
    };
  });

  return function (id) {
    return motorID2Conf[id];
  };
})()
