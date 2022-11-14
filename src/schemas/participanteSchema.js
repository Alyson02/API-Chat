import Joi from "joi";

export const participanteSchema = Joi.object({
  name: Joi.string().required().min(3),
});
