const screen_imapsl = [
  0x1b, 0x00, 0x1c, 0x1d, 0x00, 0x01, 0x00, 0x02, 
  0x03, 0x04, 0x05, 0x06, 0x00, 0x1e, 0x00, 0x0d, 
  0x00, 0x13, 0x14, 0x00, 0x1f, 0x00, 
];

const screen_imapsteps = [
  { count:0x0000, dx:0x0002, dy:0x0002, base:0x0000 },
  { count:0x000b, dx:0x0000, dy:0x0001, base:0x0000 },
  { count:0x0008, dx:0x0001, dy:0x0000, base:0x0002 },
  { count:0x0000, dx:0x0000, dy:0x000c, base:0x0000 },
  { count:0x000a, dx:0x0000, dy:0x0000, base:0x0005 },
  { count:0x0006, dx:0x0002, dy:0x0000, base:0x0007 },
  { count:0x0005, dx:0x0000, dy:0x0000, base:0x0005 },
  { count:0x0000, dx:0x0006, dy:0x0000, base:0x0000 },
  { count:0x000c, dx:0x0000, dy:0x0001, base:0x0000 },
  { count:0x0005, dx:0x0000, dy:0x0000, base:0x000d },
  { count:0x0000, dx:0x000c, dy:0x000c, base:0x0000 },
  { count:0x0005, dx:0x0000, dy:0x0000, base:0x0005 },
  { count:0x000a, dx:0x0000, dy:0x0000, base:0x000f },
  { count:0x000c, dx:0xffff, dy:0x0000, base:0x0011 },
  { count:0x0005, dx:0x0000, dy:0x0000, base:0x000f },
  { count:0x0000, dx:0x0006, dy:0x0001, base:0x0000 },
  { count:0x000a, dx:0x0000, dy:0x0000, base:0x0014 },
  { count:0x0006, dx:0x0000, dy:0x0001, base:0x0014 },
  { count:0x0005, dx:0x0000, dy:0x0000, base:0x0014 },
  { count:0x0003, dx:0x0001, dy:0x0000, base:0x0014 },
  { count:0x0006, dx:0xffff, dy:0x0000, base:0x0014 },
  { count:0x0003, dx:0x0000, dy:0xffff, base:0x0014 },
  { count:0x0000, dx:0x0000, dy:0x0000, base:0x0000 },
];

const screen_imapsofs = [
  0x00, 0x03, 0x07, 0x0a, 0x0f, 
];

const screen_imaptext_amazon = "@@@@@SOUTH@AMERICA@1945@@@@@@@\xFFRICK@DANGEROUS@CRASH@LANDS@HIS\xFF@PLANE@OVER@THE@AMAZON@WHILE@@\xFF@SEARCHING@FOR@THE@LOST@GOOLU@\xFF@@@@@@@@@@@@TRIBE.@@@@@@@@@@@@\xFF\xFF@BUT,@BY@A@TERRIBLE@TWIST@OF@@\xFFFATE@HE@LANDS@IN@THE@MIDDLE@OF\xFF@@@A@BUNCH@OF@WILD@GOOLUS.@@@@\xFF\xFF@@CAN@RICK@ESCAPE@THESE@ANGRY@\xFF@@@AMAZONIAN@ANTAGONISTS@?@@@@\xFE";

const screen_imaptext_egypt = "@@@@EGYPT,@SOMETIMES@LATER@@@@\xFFRICK@HEADS@FOR@THE@PYRAMIDS@AT\xFF@@@@THE@REQUEST@OF@LONDON.@@@@\xFF\xFFHE@IS@TO@RECOVER@THE@JEWEL@OF@\xFFANKHEL@THAT@HAS@BEEN@STOLEN@BY\xFFFANATICS@WHO@THREATEN@TO@SMASH\xFF@IT,@IF@A@RANSOM@IS@NOT@PAID.@\xFF\xFFCAN@RICK@SAVE@THE@GEM,@OR@WILL\xFFHE@JUST@GET@A@BROKEN@ANKHEL@?@\xFE";

const screen_imaptext_castle = "@@@@EUROPE,@LATER@THAT@WEEK@@@\xFF@@RICK@RECEIVES@A@COMMUNIQUE@@\xFF@@FROM@BRITISH@INTELLIGENCE@@@\xFF@@ASKING@HIM@TO@RESCUE@ALLIED@\xFF@PRISONERS@FROM@THE@NOTORIOUS@\xFF@@@@SCHWARZENDUMPF@CASTLE.@@@@\xFF\xFF@@RICK@ACCEPTS@THE@MISSION.@@@\xFF\xFF@@@BUT@CAN@HE@LIBERATE@THE@@@@\xFF@CRUELLY@CAPTURED@COOMANDOS@?@\xFE";

const screen_imaptext_missile = "@@@@@@EUROPE,@EVEN@LATER@@@@@@\xFFRICK@LEARNS@FROM@THE@PRISONERS\xFF@THAT@THE@ENEMY@ARE@TO@LAUNCH@\xFFAN@ATTACK@ON@LONDON@FROM@THEIR\xFF@@@@@SECRET@MISSILE@BASE.@@@@@\xFF\xFFWITHOUT@HESITATION,@HE@DECIDES\xFF@@@TO@INFILTRATE@THE@BASE.@@@@\xFF\xFFCAN@RICK@SAVE@LONDON@IN@TIME@?\xFE";

const screen_imaptext_muchlater = "@@@LONDON,@MUCH,@MUCH@LATER@@@\xFF@RICK@RETURNS@TO@A@TRIUMPHANT@\xFF@@WELCOME@HOME@HAVING@HELPED@@\xFF@@@@SECURE@ALLIED@VICTORY.@@@@\xFF\xFFBUT,@MEANWHILE,@IN@SPACE,@THE@\xFF@@@MASSED@STARSHIPS@OF@THE@@@@\xFF@@@BARFIAN@EMPIRE@ARE@POISED@@\xFF@@@@@TO@INVADE@THE@EARTH.@@@@@\xFF\xFF@WHAT@WILL@RICK@DO@NEXT@...@?@\xFE";

const screen_imaptext = [
  screen_imaptext_amazon,
  screen_imaptext_egypt,
  screen_imaptext_castle,
  screen_imaptext_missile,
  screen_imaptext_muchlater,
];

const screen_imainhoft = [
  0x2f, 0x2f, 0x2f, 0x2f, 0x2f, 0xd4, 0xb7, 0xb1, 
  0xac, 0xc6, 0x2f, 0xc6, 0x2f, 0x2f, 0xa4, 0xac, 
  0x9b, 0xc1, 0x2f, 0x9b, 0xc1, 0xb1, 0xac, 0xb6, 
  0xbd, 0x9b, 0xc1, 0x2f, 0x2f, 0x2f, 0x2f, 0x2f, 
  0xff, 0x2f, 0x2f, 0x2f, 0x2f, 0x2f, 0xb2, 0xb3, 
  0xb2, 0xb3, 0xad, 0x2f, 0xad, 0x2f, 0x2f, 0xa6, 
  0xae, 0xc2, 0xc3, 0x2f, 0xc2, 0xc3, 0xb2, 0xb3, 
  0xbe, 0xbf, 0xc2, 0xc3, 0x2f, 0x2f, 0x2f, 0x2f, 
  0x2f, 0xff, 0x2f, 0x2f, 0x2f, 0x2f, 0x2f, 0x9f, 
  0xc0, 0xb4, 0xb5, 0xaf, 0xc4, 0xaf, 0xc4, 0x2f, 
  0xa7, 0xb0, 0xb4, 0x2f, 0x2f, 0xb4, 0x2f, 0xb4, 
  0xb5, 0xb4, 0xb5, 0xaf, 0xc4, 0x2f, 0x2f, 0x2f, 
  0x2f, 0x2f, 0xfe, 
];

const screen_imainrdt = [
  0x2f, 0x2f, 0x2f, 0x9b, 0x9c, 0xa1, 0xa4, 0xa5, 
  0xa9, 0xaa, 0x2f, 0x9b, 0xac, 0xb1, 0xac, 0xb6, 
  0xb7, 0xa4, 0xa5, 0x9b, 0xc1, 0x9b, 0x9c, 0xa4, 
  0xac, 0xc6, 0xc7, 0xc8, 0xc9, 0x2f, 0x2f, 0x2f, 
  0xff, 0x2f, 0x2f, 0x2f, 0x9d, 0x9e, 0xa2, 0xa6, 
  0x2f, 0x9d, 0xab, 0x2f, 0xad, 0xae, 0xb2, 0xb3, 
  0xb8, 0xb9, 0xa6, 0xbb, 0xc2, 0xc3, 0x9d, 0x9e, 
  0xa6, 0xae, 0xad, 0xae, 0xca, 0xcb, 0x2f, 0x2f, 
  0x2f, 0xff, 0x2f, 0x2f, 0x2f, 0x9f, 0xa0, 0xa3, 
  0xa7, 0xa8, 0x9f, 0xa0, 0x2f, 0xaf, 0xb0, 0xb4, 
  0xb5, 0x9f, 0xba, 0xa7, 0xbc, 0xaf, 0xc4, 0x9f, 
  0xa0, 0xa7, 0xb0, 0xc5, 0xb0, 0xcc, 0xb0, 0x2f, 
  0x2f, 0x2f, 0xfe, 
];

const screen_congrats = [
  0xa4, 0xa5, 0xa4, 0xac, 0xb6, 0xb7, 0xa4, 0xa5, 
  0x9b, 0x9c, 0xb1, 0xac, 0xcd, 0xce, 0xc6, 0xc7, 
  0xd3, 0x2f, 0xb1, 0xac, 0xcd, 0xce, 0xa1, 0xa4, 
  0xac, 0xb6, 0xb7, 0xc8, 0xc9, 0x2f, 0xd5, 0xd6, 
  0xff, 0xa6, 0x2f, 0xa6, 0xae, 0xb8, 0xb9, 0xa6, 
  0xbb, 0x9d, 0x9e, 0xb2, 0xb3, 0xcf, 0xd0, 0xad, 
  0xae, 0xad, 0x2f, 0xb2, 0xb3, 0xcf, 0xd0, 0xa2, 
  0xa6, 0xae, 0xb8, 0xb9, 0xca, 0xcb, 0x2f, 0xd7, 
  0xd8, 0xff, 0xa7, 0xa8, 0xa7, 0xb0, 0x9f, 0xba, 
  0xa7, 0xbc, 0x9f, 0xa0, 0xb4, 0xb5, 0xd1, 0xd2, 
  0xc5, 0xb0, 0xaf, 0xc4, 0xb4, 0xb5, 0xd1, 0xd2, 
  0xa3, 0xa7, 0xb0, 0x9f, 0xba, 0xcc, 0xb0, 0x2f, 
  0xd9, 0xda, 0xfe, 
];

const screen_imaincdc = "@@@@@@@@@@@@@@@@@@@\xFF\xFF(C)@1989@CORE@DESIGN\xFF\xFF\xFF@PRESS@SPACE@TO@START\xFE";

const screen_gameovertxt = "@@@@@@@@@@@\xFF@GAME@OVER@\xFF@@@@@@@@@@@\xFE";

const screen_pausedtxt = "@@@@@@@@@@\xFF@@PAUSED@@\xFF@@@@@@@@@@\xFE";

